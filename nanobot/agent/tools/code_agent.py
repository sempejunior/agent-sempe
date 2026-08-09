"""Delegate writing code to an external agent CLI, inside an already cloned repo.

The orchestrating agent can run a cheap model: it reads the demand, prepares the
branch and judges the result. Writing the code is handed to a specialist CLI that
runs headless — a prompt as argument, an exit code as answer. Driving an
interactive TUI through a pty would break on the first layout change; headless
mode is what the vendors document and what CI uses.

Three things this module refuses to do, and each is a decision rather than an
omission:

- **No free-form command.** The caller gives a repository and an instruction; the
  binary and its flags come from the spec below.
- **No work on the default branch.** Same rule the ``repo`` tool enforces, so a
  delegation can never write straight to main.
- **No treating the CLI's text as truth.** Vendors do not document the output as
  machine-readable. What actually happened is the exit code, the ``git diff`` and
  the tests — the CLI's prose is context.

The log goes to a file while the process runs, so a timeout still leaves evidence
instead of discarding minutes of work, and the model gets the *tail* of it — an
agent CLI writes its summary at the end.

Because it runs headless, the CLI cannot ask anything: a decision that is missing
from the prompt would become an invented one. So it gets one escape hatch — a
``blocked`` report it writes to a file (see ``_BLOCKED_REPORT``) — and stopping to
ask is reported as its own outcome, never as a failure and never as a fix.

A delegation takes minutes, which is longer than a turn may last. With a
``job_runner`` wired the tool can hand the work to a background job and answer
with its handle; the conclusion comes back later as a new turn.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import Any

from nanobot.agent import notes, trace
from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.branches import is_protected, protected_names
from nanobot.agent.tools.process import kill_process_group

_DEFAULT_TIMEOUT_S = 1800
_BUDGET_SHARE = 0.6
"""Fraction of the turn's budget one delegation may consume.

The tool used to get the whole ``max_job_duration_s``, which is also the ceiling
of the scheduled routine that drives it — so a single delegation could burn the
entire budget and the run would be killed before the diff was reviewed, the tests
run, the commit made and the PR opened. What is left over is for those steps."""

_LOG_TAIL_CHARS = 6_000
_JOB_SLACK_S = 60
"""Slack between the tool's own ceiling and the job's.

Both would otherwise fire at the same instant, and the useful report — diff,
changed files, log tail — comes from the tool's timeout, not the job's backstop."""
_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM")
_EXTRA_BIN_DIRS = ("/root/.local/bin", "/usr/local/bin")
"""Where vendor installers drop the binary. Their scripts install to the user's
local bin and then ask you to fix PATH yourself, which a service process never
reads — so look there directly instead of depending on the environment."""

_MANAGED_DIR = "tools"
_INSTALL_TIMEOUT_S = 900

_BLOCKED_REPORT = ".nanobot/delegation.json"
_AGENT_DOCS = "AGENTS.md, CLAUDE.md, CONTRIBUTING.md"
"""Where a repository states its rules for whoever writes code in it. Named
rather than discovered because the CLI reads what it is told to read, and a
delegation that ignores the house rules produces a patch that works and gets
rejected."""
"""Where the CLI says it stopped instead of guessing.

A file, not prose: the CLI runs headless with no way to ask anything, so without
an explicit escape hatch a missing business decision becomes an invented one, and
"I was blocked" arrives indistinguishable from "I did it wrong"."""

_QUESTION_MAX_CHARS = 500


@dataclass(frozen=True)
class InstallSpec:
    """How to install this CLI on the machine, when the image did not bake it in.

    ``requires`` are binaries the installer itself needs — declared here so a
    missing one is reported by name instead of failing deep inside a vendor script.
    """

    url: str
    requires: tuple[str, ...] = ()
    size_hint: str = ""


@dataclass(frozen=True)
class CredentialKey:
    """One way to authenticate a CLI: a credential field and the variable it fills.

    A tuple of these rather than a single pair because a vendor can accept more
    than one kind of credential, and they are not interchangeable — a Claude Code
    subscription token and a console API key reach different billing and enable
    different flags. The first field the client actually filled in wins.
    """

    field: str
    env: str
    args: tuple[str, ...] = ()
    label: str = ""


@dataclass(frozen=True)
class CliSpec:
    """How to invoke one agent CLI headlessly.

    Everything vendor-specific lives here, so supporting another CLI is a new
    entry rather than a branch in the code.
    """

    integration: str
    binary: str
    args: tuple[str, ...]
    keys: tuple[CredentialKey, ...]
    prompt_via: str = "arg"
    """Where the prompt goes: ``arg`` (last positional) or ``stdin``.

    A CLI with a variadic flag swallows a trailing positional — Claude Code's
    ``--allowedTools <tools...>`` eats the prompt and then complains no prompt was
    given. Stdin sidesteps argument parsing entirely, and keeps the demand's text
    out of the process list."""

    ok_codes: tuple[int, ...] = (0,)
    failure_markers: tuple[str, ...] = ()
    notes: str = ""
    install: InstallSpec | None = None


CLI_SPECS: tuple[CliSpec, ...] = (
    CliSpec(
        integration="claude_code",
        binary="claude",
        args=("--print", "--model", "sonnet",
              "--permission-mode", "acceptEdits",
              "--allowedTools", "Read Write Edit Glob Grep Bash"),
        prompt_via="stdin",
        keys=(
            CredentialKey(
                "oauth_token", "CLAUDE_CODE_OAUTH_TOKEN",
                label="token de assinatura",
            ),
            CredentialKey(
                "api_key", "ANTHROPIC_API_KEY", args=("--bare",),
                label="API key do console",
            ),
        ),
        failure_markers=("Invalid API key", "OAuth token has expired",
                         "Please run /login", "Credit balance is too low"),
        notes=("--model sonnet é fixo para este fluxo. Nada de "
               "bypassPermissions: o CLI recusa esse modo rodando como root, e "
               "o gateway roda como root — a saída é conceder as ferramentas "
               "explicitamente, que também é o modo mais restrito. --bare só "
               "entra com API key: ele lê a credencial estritamente da variável "
               "de ambiente e ignora OAuth, o que quebraria o token de assinatura."),
        install=InstallSpec(url="https://claude.ai/install.sh",
                            size_hint="~290 MB"),
    ),
    CliSpec(
        integration="kiro",
        binary="kiro-cli",
        args=("chat", "--no-interactive",
              "--trust-tools=fs_read,fs_write,execute_bash",
              "--require-mcp-startup"),
        keys=(CredentialKey("api_key", "KIRO_API_KEY"),),
        failure_markers=("Authentication failed", "Failed to open URL",
                         "--use-device-flow"),
        notes=("exit 1 = falha geral; exit 3 = MCP não subiu. Atenção: na versão "
               "2.16.2 ele sai com 0 mesmo em falha de autenticação, por isso a "
               "saída também é inspecionada."),
        install=InstallSpec(url="https://cli.kiro.dev/install", requires=("unzip",),
                            size_hint="~856 MB"),
    ),
)


def cli_integrations() -> tuple[str, ...]:
    """Integration ids that provide a code agent CLI — derived, not hand-written."""
    return tuple(spec.integration for spec in CLI_SPECS)


def get_cli_spec(integration: str) -> CliSpec | None:
    for spec in CLI_SPECS:
        if spec.integration == integration:
            return spec
    return None


def managed_home(workspace: Path, integration: str) -> Path:
    """Where a CLI installed by us lives.

    Under the workspace on purpose: that path is a mounted volume, so an install
    survives a container recreate. A button whose effect vanishes on the next
    deploy would not solve anything.
    """
    return workspace / _MANAGED_DIR / integration


def managed_binary(workspace: Path, spec: CliSpec) -> Path:
    """The binary path a managed install produces (``$HOME/.local/bin``)."""
    return managed_home(workspace, spec.integration) / ".local" / "bin" / spec.binary


def resolve_binary(spec: CliSpec, workspace: Path | None = None) -> str | None:
    """Find the CLI: PATH first (operator override), then our managed install."""
    found = _which(spec.binary)
    if found:
        return found
    if workspace:
        candidate = managed_binary(workspace, spec)
        if candidate.is_file():
            return str(candidate)
    return None


def installed_binary(spec: CliSpec, workspace: Path | None = None) -> str | None:
    """Public alias for status endpoints — resolves without touching the model."""
    return resolve_binary(spec, workspace)


async def install_cli(spec: CliSpec, workspace: Path) -> tuple[bool, str]:
    """Run the vendor installer into the managed directory.

    Returns ``(ok, log)``. Success is the binary answering ``--version``, not the
    installer's exit code — vendor scripts are not reliable about that.
    """
    if not spec.install:
        return False, f"{spec.integration} não declara instalador."

    missing = [dep for dep in spec.install.requires if not _which(dep)]
    if missing:
        ok, log = await _apt_install(missing)
        if not ok:
            return False, (
                f"O instalador precisa de {', '.join(missing)} e não foi possível "
                f"instalar automaticamente. Reconstrua a imagem (o Dockerfile já "
                f"inclui essa dependência).\n{log}"
            )

    home = managed_home(workspace, spec.integration)
    home.mkdir(parents=True, exist_ok=True)
    script = home / "install.sh"

    ok, log = await _run(["curl", "-fsSL", spec.install.url, "-o", str(script)],
                         cwd=home, env={})
    if not ok or not script.is_file():
        return False, f"Falha ao baixar o instalador de {spec.install.url}.\n{log}"

    ok, install_log = await _run(["bash", str(script)], cwd=home,
                                 env={"HOME": str(home)})
    log = f"{log}\n{install_log}".strip()

    binary = managed_binary(workspace, spec)
    if not binary.is_file():
        return False, f"O instalador terminou mas o binário não apareceu.\n{log}"

    ok, version = await _run([str(binary), "--version"], cwd=home, env={})
    if not ok:
        return False, f"O binário foi instalado mas não executa.\n{version}"
    return True, f"{version.strip()}\n{log}"


async def _apt_install(packages: list[str]) -> tuple[bool, str]:
    """Install a declared dependency of the installer — never an arbitrary name."""
    await _run(["apt-get", "update"], cwd=Path("/tmp"), env={"DEBIAN_FRONTEND": "noninteractive"})
    return await _run(
        ["apt-get", "install", "-y", "--no-install-recommends", *packages],
        cwd=Path("/tmp"), env={"DEBIAN_FRONTEND": "noninteractive"},
    )


async def _run(args: list[str], *, cwd: Path, env: dict[str, str]) -> tuple[bool, str]:
    """Run a command with a built environment, capped output. Returns (ok, output)."""
    child_env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
    child_env.update(env)
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            cwd=str(cwd), env=child_env, start_new_session=True,
        )
    except FileNotFoundError:
        return False, f"comando não encontrado: {args[0]}"
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(),
                                          timeout=_INSTALL_TIMEOUT_S)
    except asyncio.TimeoutError:
        await kill_process_group(process)
        return False, f"{args[0]} passou de {_INSTALL_TIMEOUT_S}s"
    out = stdout.decode("utf-8", errors="replace")
    return process.returncode == 0, out[-_LOG_TAIL_CHARS:]


class CodeAgentTool(Tool):
    """Hand a coding task to an agent CLI running in the cloned repository."""

    parallel_safe = False
    """The delegation owns the working tree while it runs."""

    def __init__(self, *, user_id: str, integration_repo: Any, credential_repo: Any,
                 agent_dir: Path, workspace: Path | None = None,
                 timeout: int = _DEFAULT_TIMEOUT_S, job_runner: Any = None):
        self._user_id = user_id
        self._integration_repo = integration_repo
        self._credential_repo = credential_repo
        self._agent_dir = agent_dir
        self._workspace = workspace
        self._timeout = int((timeout or _DEFAULT_TIMEOUT_S) * _BUDGET_SHARE)
        self.timeout_s = self._timeout
        self._jobs = job_runner
        self._agent_id = ""
        self._origin_channel = ""
        self._origin_chat_id = ""

    def set_origin(self, *, channel: str = "", chat_id: str = "",
                   user_id: str = "", agent_id: str = "", **_: Any) -> None:
        """Remember where this turn came from, so a job can answer back there."""
        self._origin_channel = channel
        self._origin_chat_id = chat_id
        self._agent_id = agent_id or self._agent_id

    @property
    def name(self) -> str:
        return "code_agent"

    @property
    def description(self) -> str:
        return (
            "Delega a escrita do código a um agente especialista de terminal, "
            "dentro de um repositório já clonado com a tool repo. Use para "
            "mudança que exige explorar o código; para ajuste de uma ou duas "
            "linhas, edite você mesmo (é mais rápido e barato). Escreva a "
            "instrução como você explicaria a um desenvolvedor: o problema em "
            "instruction, e o resultado esperado, como verificar e as convenções "
            "do projeto nos campos próprios — é o que determina a qualidade do "
            "que ele escreve. Ele edita arquivos e roda comandos, mas NÃO "
            "commita nem envia — isso continua seu, com a tool repo, depois de "
            "você revisar o diff e rodar os testes."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "repo": {
                    "type": "string",
                    "description": "Caminho do repositório devolvido por repo ensure.",
                },
                "instruction": {
                    "type": "string",
                    "description": "O problema a resolver, com o contexto da "
                                   "demanda: o que está errado e em que situação.",
                },
                "expected": {
                    "type": "string",
                    "description": "O resultado esperado depois da mudança — como "
                                   "fica o comportamento correto.",
                },
                "verify": {
                    "type": "string",
                    "description": "Como provar que funcionou: o comando de teste "
                                   "do projeto, ou o cenário a reproduzir.",
                },
                "constraints": {
                    "type": "string",
                    "description": "Limites e convenções do projeto (o que não "
                                   "mexer, padrão do código, armadilhas). Vem da "
                                   "skill do projeto, quando existe.",
                },
                "focus": {
                    "type": "array", "items": {"type": "string"},
                    "description": "Arquivos ou diretórios onde olhar primeiro "
                                   "(opcional, ajuda a CLI a começar certo).",
                },
            },
            "required": ["repo", "instruction"],
        }
        if self._jobs:
            schema["properties"]["background"] = {
                "type": "boolean",
                "description": "true entrega a delegação a uma tarefa de fundo e "
                               "devolve o identificador na hora, sem esperar. Use "
                               "sempre que houver alguém aguardando resposta no "
                               "chat: a delegação leva minutos e o turno tem teto. "
                               "Você recebe o resultado depois, numa mensagem "
                               "nova, e continua o trabalho a partir dela.",
            }
        return schema

    async def execute(self, repo: str = "", instruction: str = "",
                      expected: str = "", verify: str = "", constraints: str = "",
                      focus: list[str] | None = None, background: bool = False,
                      **_: Any) -> str:
        if not instruction.strip():
            return "Error: instruction é obrigatória — descreva o que fazer."
        try:
            local = self._resolve_repo(repo)
            spec, key, secret = await self._resolve_cli()
        except _DelegationError as e:
            return f"Error: {e}"

        branch = await self._current_branch(local)
        default = await self._default_branch(local)
        if is_protected(branch, default):
            return (f"Error: o repositório está em '{branch}', um branch protegido "
                    f"({protected_names(default)}). Crie o branch da demanda com a "
                    "tool repo antes de delegar — a delegação comita, e commit em "
                    "branch protegido não acontece.")

        prompt = self._build_prompt(
            instruction, focus or [],
            expected=expected, verify=verify, constraints=constraints,
            branch=branch,
        )
        if background and self._jobs:
            return await self._submit(spec, key, prompt, local, branch, secret,
                                      instruction)
        return await self._delegate(spec, key, prompt, local, branch, secret)

    async def _submit(self, spec: CliSpec, key: CredentialKey, prompt: str,
                      local: Path, branch: str, secret: str,
                      instruction: str) -> str:
        """Hand the delegation to a background job and answer with its handle."""

        async def work(job_id: str) -> str:
            return await self._delegate(spec, key, prompt, local, branch, secret,
                                        job_id=job_id)

        job_id = await self._jobs.submit(
            user_id=self._user_id, kind="code_agent", run=work,
            agent_id=self._agent_id, label=instruction.strip()[:80],
            origin_channel=self._origin_channel,
            origin_chat_id=self._origin_chat_id,
            params={"repo": str(local), "branch": branch},
            timeout_s=self._timeout + _JOB_SLACK_S,
        )
        await notes.emit(
            f"Delegação de código em segundo plano em {local.name} ({branch})."
        )
        return (
            f"Delegação em andamento em segundo plano: job {job_id}, no branch "
            f"{branch}. Isso leva minutos — NÃO espere aqui e não chame a "
            f"delegação de novo. Encerre o turno dizendo que começou; quando a "
            f"CLI terminar você recebe o resultado numa mensagem nova e segue "
            f"daí (rodar os testes, revisar o diff, commitar e abrir o PR). "
            f"Para consultar antes do fim: jobs(action='status', job_id='{job_id}')."
        )

    async def _delegate(self, spec: CliSpec, key: CredentialKey, prompt: str,
                        local: Path, branch: str, secret: str, *,
                        job_id: str = "") -> str:
        log_path = self._log_path()
        await trace.emit("delegation", cli=spec.binary, repo=str(local), branch=branch,
                         prompt=trace.clip(prompt), timeout_s=self._timeout,
                         credential=key.field, job_id=job_id)
        await notes.emit(f"Escrevendo o código em {local.name} ({branch}) — isso leva minutos.")
        started = time.monotonic()
        code, timed_out = await self._run(spec, key, prompt, local, secret, log_path,
                                          job_id=job_id)
        elapsed = int(time.monotonic() - started)
        await notes.emit(f"Delegação em {local.name} terminou em {elapsed}s.")

        return await self._report(
            spec=spec, local=local, branch=branch, log_path=log_path,
            code=code, timed_out=timed_out, elapsed=elapsed, secret=secret,
        )

    def _resolve_repo(self, repo: str) -> Path:
        if not repo:
            raise _DelegationError("informe o repo devolvido por repo ensure")
        local = Path(repo).expanduser().resolve()
        root = self._agent_dir.resolve()
        try:
            local.relative_to(root)
        except ValueError:
            raise _DelegationError(f"repo {repo} está fora de {root}") from None
        if not (local / ".git").is_dir():
            raise _DelegationError(f"{repo} não é um repositório clonado")
        return local

    async def _resolve_cli(self) -> tuple[CliSpec, CredentialKey, str]:
        """Pick the first CLI whose integration is active and whose binary exists."""
        from nanobot.utils.crypto import decrypt
        missing_binary: list[str] = []
        for spec in CLI_SPECS:
            row = await self._integration_repo.get_integration(self._user_id, spec.integration)
            if not row or not row.get("enabled") or not row.get("credential_id"):
                continue
            resolved = resolve_binary(spec, self._workspace)
            if not resolved:
                missing_binary.append(spec.binary)
                continue
            cred = await self._credential_repo.get_credential(
                self._user_id, row["credential_id"])
            cipher = (cred or {}).get("secret_cipher", "")
            if not cipher:
                continue
            try:
                data = json.loads(decrypt(cipher))
            except (ValueError, TypeError):
                raise _DelegationError(
                    f"credencial de '{spec.integration}' ilegível") from None
            for key in spec.keys:
                secret = str(data.get(key.field, "")).strip()
                if secret:
                    return replace(spec, binary=resolved), key, secret
            fields = ", ".join(f"'{key.field}'" for key in spec.keys)
            raise _DelegationError(
                f"credencial de '{spec.integration}' não tem nenhum dos campos "
                f"aceitos ({fields})")
        if missing_binary:
            raise _DelegationError(
                f"a integração está ativa mas o binário não está instalado nesta "
                f"máquina ({', '.join(missing_binary)})"
            )
        raise _DelegationError(
            "nenhum agente de código ativo. Ative um em Integrações "
            f"({', '.join(cli_integrations())}) com a chave de API."
        )

    @staticmethod
    def _build_prompt(instruction: str, focus: list[str], *, expected: str = "",
                      verify: str = "", constraints: str = "",
                      branch: str = "") -> str:
        parts = [f"## Problema\n{instruction.strip()}"]
        for title, value in (
            ("Resultado esperado", expected),
            ("Como verificar", verify),
            ("Convenções e limites do projeto", constraints),
        ):
            if value.strip():
                parts.append(f"## {title}\n{value.strip()}")
        if focus:
            parts.append("Comece olhando: " + ", ".join(focus))
        working = f" ('{branch}')" if branch else ""
        parts.append(
            f"Você está num repositório git, no branch de trabalho da demanda"
            f"{working}, criado para ela. Faça a mudança mínima que resolve o "
            "problema, no estilo do código existente, e comite nesse branch com "
            "uma mensagem que explique o que mudou e por quê."
        )
        parts.append(
            "Antes de editar qualquer arquivo, procure na raiz do repositório os "
            f"documentos que o projeto escreveu para agentes ({_AGENT_DOCS}) e leia "
            "os que existirem. Eles dizem o estilo, os limites e onde NÃO se mexe. "
            "Um patch que ignora essas regras é retrabalho, mesmo quando funciona."
        )
        parts.append(
            "Limites que não se negociam: NÃO troque de branch e NÃO comite em "
            "main, master ou develop. NÃO faça push — quem envia é o "
            "orquestrador, que tem a credencial do git; você não tem. NÃO altere "
            "o histórico (nada de amend, rebase ou force). NÃO faça merge."
        )
        parts.append(
            "Se faltar uma decisão que não é sua para tomar — uma regra de "
            "negócio, qual dos comportamentos possíveis é o correto, um dado que "
            f"não está no pedido — NÃO adivinhe: escreva o arquivo "
            f"`{_BLOCKED_REPORT}` com "
            '{"status": "blocked", "question": "<a pergunta, em uma frase>"} '
            "e pare sem alterar mais nada. Uma pergunta boa vale mais que um "
            "patch errado."
        )
        return "\n\n".join(parts)

    def _log_path(self) -> Path:
        """A log file no concurrent delegation can take over.

        The name used to stop at the second. Two delegations starting inside the
        same second — the loop batches tool calls, and the job runner runs two at
        once — resolved to one path, which ``_run`` then opens truncating: the
        second wiped the first's log and both reported the same output.
        """
        logs = self._agent_dir / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        return logs / f"code-agent-{stamp}-{uuid.uuid4().hex[:6]}.log"

    async def _run(self, spec: CliSpec, key: CredentialKey, prompt: str, cwd: Path,
                   secret: str, log_path: Path, *,
                   job_id: str = "") -> tuple[int | None, bool]:
        """Run the CLI, streaming output to a file. Returns (exit code, timed out)."""
        env = {name: os.environ[name] for name in _ENV_ALLOWLIST if name in os.environ}
        env[key.env] = secret
        by_stdin = spec.prompt_via == "stdin"
        argv = [spec.binary, *spec.args, *key.args]
        if not by_stdin:
            argv.append(prompt)
        with log_path.open("wb") as log:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE if by_stdin else asyncio.subprocess.DEVNULL,
                stdout=log, stderr=asyncio.subprocess.STDOUT,
                cwd=str(cwd), env=env, start_new_session=True,
            )
            if by_stdin and process.stdin:
                process.stdin.write(prompt.encode("utf-8"))
                await process.stdin.drain()
                process.stdin.close()
            if job_id and self._jobs:
                await self._jobs.attach_process(
                    self._user_id, job_id, pid=process.pid, log_path=str(log_path),
                )
            try:
                await asyncio.wait_for(process.wait(), timeout=self._timeout)
            except asyncio.TimeoutError:
                await kill_process_group(process)
                return None, True
            except asyncio.CancelledError:
                await kill_process_group(process)
                raise
        return process.returncode, False

    async def _report(self, *, spec: CliSpec, local: Path, branch: str, log_path: Path,
                      code: int | None, timed_out: bool, elapsed: int,
                      secret: str) -> str:
        tail = _scrub(_tail(log_path, _LOG_TAIL_CHARS), secret)
        blocked = _take_blocked_report(local)
        failed_quietly = not blocked and _has_marker(tail, spec.failure_markers)
        reverted = await self._revert(local) if blocked or failed_quietly else False

        status = await self._git(["status", "--porcelain"], cwd=local)
        stat = await self._git(["diff", "--stat"], cwd=local)

        if blocked:
            undone = " O que tinha ficado na árvore foi revertido." if reverted else ""
            headline = (
                f"O agente de código PAROU e devolveu uma pergunta em vez de "
                f"adivinhar:\n\n> {blocked}\n\n"
                f"Ele está certo em parar: falta uma decisão que não é dele nem "
                f"sua. NÃO abra PR e não decida no lugar de quem pediu. Registre "
                f"essa pergunta como pendência, deixe-a onde a pessoa responsável "
                f"vai ver, e siga para o próximo item.{undone}"
            )
        elif timed_out:
            headline = (f"O agente de código foi interrompido depois de {elapsed}s "
                        f"(teto de {self._timeout}s). O que ele já tinha feito está "
                        "no repositório — revise o diff antes de decidir.")
        elif failed_quietly:
            undone = " O que tinha ficado na árvore foi revertido." if reverted else ""
            headline = (f"O agente de código NÃO fez o trabalho: a saída indica "
                        f"falha de autenticação ou de configuração, apesar do exit "
                        f"{code}. Confira a chave da integração. Nada foi "
                        f"entregue.{undone}")
        elif code in spec.ok_codes:
            headline = f"O agente de código terminou em {elapsed}s."
        else:
            hint = f" {spec.notes}" if spec.notes else ""
            headline = (f"O agente de código falhou (exit {code}) depois de "
                        f"{elapsed}s.{hint}")

        changed = status.strip() or "(nenhum arquivo alterado)"
        return "\n\n".join([
            headline,
            f"Arquivos alterados:\n{changed}",
            f"Diff:\n{stat.strip() or '(vazio)'}",
            f"Branch de trabalho: {branch}",
            f"Log completo: {log_path}",
            f"Fim do log:\n{tail or '(vazio)'}",
            "Revise o diff, rode os testes e só então comite com a tool repo. "
            "Se o teste falhar, não abra PR.",
        ])

    async def _revert(self, local: Path) -> bool:
        """Undo what a delegation that produced nothing of value left behind.

        A quiet auth failure or a delegation that stopped to ask a question means
        there is no fix in the tree, only noise the next step could commit as if
        it were one. A *timeout* is the opposite case — that work is real and is
        kept. Untracked files are left alone: deleting files nobody asked us to
        delete is worse than reporting them.
        """
        if not (await self._git(["status", "--porcelain"], cwd=local)).strip():
            return False
        await self._git(["checkout", "--", "."], cwd=local)
        return True

    async def _current_branch(self, local: Path) -> str:
        return (await self._git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=local)).strip()

    async def _default_branch(self, local: Path) -> str:
        out = await self._git(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
                              cwd=local)
        if out.strip():
            return out.strip().rsplit("/", 1)[-1]
        for candidate in ("main", "master"):
            if (await self._git(["rev-parse", "--verify", f"origin/{candidate}"],
                                cwd=local)).strip():
                return candidate
        return "main"

    @staticmethod
    async def _git(args: list[str], *, cwd: Path) -> str:
        env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
        process = await asyncio.create_subprocess_exec(
            "git", *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            cwd=str(cwd), env=env,
        )
        stdout, _ = await process.communicate()
        return stdout.decode("utf-8", errors="replace") if process.returncode == 0 else ""


class _DelegationError(Exception):
    """Expected, explainable failure — reported to the model, never raised out."""


def _which(binary: str) -> str | None:
    """Resolve the binary on PATH, then in the directories installers use."""
    import shutil
    found = shutil.which(binary)
    if found:
        return found
    if Path(binary).is_absolute():
        return binary if Path(binary).is_file() else None
    for directory in _EXTRA_BIN_DIRS:
        candidate = Path(directory) / binary
        if candidate.is_file():
            return str(candidate)
    return None


def _take_blocked_report(local: Path) -> str:
    """The question the CLI left behind, if it chose to stop instead of guessing.

    Read and removed in one go: the file lives inside the repository, so leaving
    it behind would show up as an untracked change and could end up in the commit.
    """
    path = local / _BLOCKED_REPORT
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    finally:
        _remove_quietly(path)
    try:
        data = json.loads(raw)
    except ValueError:
        return raw.strip()[:_QUESTION_MAX_CHARS]
    if str(data.get("status", "")).lower() != "blocked":
        return ""
    return str(data.get("question", "")).strip()[:_QUESTION_MAX_CHARS]


def _remove_quietly(path: Path) -> None:
    """Delete the report, and the directory it lived in when that is now empty."""
    try:
        path.unlink()
        if not any(path.parent.iterdir()):
            path.parent.rmdir()
    except OSError:
        return


def _tail(path: Path, limit: int) -> str:
    """Last ``limit`` characters — an agent CLI puts its summary at the end."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[-limit:] if len(text) > limit else text


def _scrub(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


async def read_delegation_log(
    log_path: str, *, user_id: str, integration_repo: Any, credential_repo: Any,
    limit: int = _LOG_TAIL_CHARS,
) -> str:
    """The tail of a delegation log, with the CLI credential masked out.

    The file holds whatever the CLI printed, unfiltered — anything reading it
    outside this module has to mask the secret, and the only way to mask it is
    to know it, so it is resolved here the same way a delegation resolves it.
    """
    secrets = await _cli_secrets(user_id, integration_repo, credential_repo)
    text = _tail(Path(log_path), limit)
    for secret in secrets:
        text = _scrub(text, secret)
    return text


async def _cli_secrets(
    user_id: str, integration_repo: Any, credential_repo: Any,
) -> list[str]:
    """Every code-CLI secret this user has, so none of them can leak in a log."""
    from nanobot.utils.crypto import decrypt

    found: list[str] = []
    for spec in CLI_SPECS:
        row = await integration_repo.get_integration(user_id, spec.integration)
        if not row or not row.get("credential_id"):
            continue
        cred = await credential_repo.get_credential(user_id, row["credential_id"])
        cipher = (cred or {}).get("secret_cipher", "")
        if not cipher:
            continue
        try:
            data = json.loads(decrypt(cipher))
        except (ValueError, TypeError):
            continue
        found.extend(
            str(data[key.field]).strip() for key in spec.keys
            if str(data.get(key.field, "")).strip()
        )
    return found


def _has_marker(text: str, markers: tuple[str, ...]) -> bool:
    """Detect a failure the CLI reported in prose while still exiting 0.

    kiro-cli 2.16.2 exits 0 on an authentication failure, so the exit code alone
    would report a false success — the worst outcome for an automated flow.
    """
    return any(marker in text for marker in markers)
