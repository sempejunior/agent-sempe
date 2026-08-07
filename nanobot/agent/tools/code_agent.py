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
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import time
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool

_DEFAULT_TIMEOUT_S = 1800
_BUDGET_SHARE = 0.6
"""Fraction of the turn's budget one delegation may consume.

The tool used to get the whole ``max_job_duration_s``, which is also the ceiling
of the scheduled routine that drives it — so a single delegation could burn the
entire budget and the run would be killed before the diff was reviewed, the tests
run, the commit made and the PR opened. What is left over is for those steps."""

_LOG_TAIL_CHARS = 6_000
_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM")
_EXTRA_BIN_DIRS = ("/root/.local/bin", "/usr/local/bin")
"""Where vendor installers drop the binary. Their scripts install to the user's
local bin and then ask you to fix PATH yourself, which a service process never
reads — so look there directly instead of depending on the environment."""

_MANAGED_DIR = "tools"
_INSTALL_TIMEOUT_S = 900


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
class CliSpec:
    """How to invoke one agent CLI headlessly.

    Everything vendor-specific lives here, so supporting another CLI is a new
    entry rather than a branch in the code.
    """

    integration: str
    binary: str
    args: tuple[str, ...]
    key_env: str
    key_field: str = "api_key"
    ok_codes: tuple[int, ...] = (0,)
    failure_markers: tuple[str, ...] = ()
    notes: str = ""
    install: InstallSpec | None = None


CLI_SPECS: tuple[CliSpec, ...] = (
    CliSpec(
        integration="kiro",
        binary="kiro-cli",
        args=("chat", "--no-interactive",
              "--trust-tools=fs_read,fs_write,execute_bash",
              "--require-mcp-startup"),
        key_env="KIRO_API_KEY",
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
        await _kill_group(process)
        return False, f"{args[0]} passou de {_INSTALL_TIMEOUT_S}s"
    out = stdout.decode("utf-8", errors="replace")
    return process.returncode == 0, out[-_LOG_TAIL_CHARS:]


class CodeAgentTool(Tool):
    """Hand a coding task to an agent CLI running in the cloned repository."""

    def __init__(self, *, user_id: str, integration_repo: Any, credential_repo: Any,
                 agent_dir: Path, workspace: Path | None = None,
                 timeout: int = _DEFAULT_TIMEOUT_S):
        self._user_id = user_id
        self._integration_repo = integration_repo
        self._credential_repo = credential_repo
        self._agent_dir = agent_dir
        self._workspace = workspace
        self._timeout = int((timeout or _DEFAULT_TIMEOUT_S) * _BUDGET_SHARE)

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
        return {
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

    async def execute(self, repo: str = "", instruction: str = "",
                      expected: str = "", verify: str = "", constraints: str = "",
                      focus: list[str] | None = None, **_: Any) -> str:
        if not instruction.strip():
            return "Error: instruction é obrigatória — descreva o que fazer."
        try:
            local = self._resolve_repo(repo)
            spec, secret = await self._resolve_cli()
        except _DelegationError as e:
            return f"Error: {e}"

        branch = await self._current_branch(local)
        default = await self._default_branch(local)
        if branch == default:
            return (f"Error: o repositório está no branch default ('{branch}'). "
                    "Crie um branch de trabalho com a tool repo antes de delegar.")

        prompt = self._build_prompt(
            instruction, focus or [],
            expected=expected, verify=verify, constraints=constraints,
        )
        log_path = self._log_path()
        started = time.monotonic()
        code, timed_out = await self._run(spec, prompt, local, secret, log_path)
        elapsed = int(time.monotonic() - started)

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

    async def _resolve_cli(self) -> tuple[CliSpec, str]:
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
            secret = str(data.get(spec.key_field, ""))
            if not secret:
                raise _DelegationError(
                    f"credencial de '{spec.integration}' não tem o campo "
                    f"'{spec.key_field}'")
            return replace(spec, binary=resolved), secret
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
                      verify: str = "", constraints: str = "") -> str:
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
        parts.append(
            "Você está num repositório git, num branch de trabalho já criado. "
            "Faça a mudança mínima que resolve o problema, no estilo do código "
            "existente. NÃO faça commit, NÃO faça push e NÃO altere o histórico "
            "— quem revisa e comita é o orquestrador."
        )
        return "\n\n".join(parts)

    def _log_path(self) -> Path:
        logs = self._agent_dir / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return logs / f"code-agent-{stamp}.log"

    async def _run(self, spec: CliSpec, prompt: str, cwd: Path, secret: str,
                   log_path: Path) -> tuple[int | None, bool]:
        """Run the CLI, streaming output to a file. Returns (exit code, timed out)."""
        env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
        env[spec.key_env] = secret
        with log_path.open("wb") as log:
            process = await asyncio.create_subprocess_exec(
                spec.binary, *spec.args, prompt,
                stdout=log, stderr=asyncio.subprocess.STDOUT,
                cwd=str(cwd), env=env, start_new_session=True,
            )
            try:
                await asyncio.wait_for(process.wait(), timeout=self._timeout)
            except asyncio.TimeoutError:
                await _kill_group(process)
                return None, True
        return process.returncode, False

    async def _report(self, *, spec: CliSpec, local: Path, branch: str, log_path: Path,
                      code: int | None, timed_out: bool, elapsed: int,
                      secret: str) -> str:
        tail = _scrub(_tail(log_path, _LOG_TAIL_CHARS), secret)
        failed_quietly = _has_marker(tail, spec.failure_markers)
        reverted = await self._revert(local) if failed_quietly else False

        status = await self._git(["status", "--porcelain"], cwd=local)
        stat = await self._git(["diff", "--stat"], cwd=local)

        if timed_out:
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
        """Undo what a delegation that never authenticated left behind.

        A quiet auth failure means the CLI produced nothing of value, so anything
        in the tree is noise that the next step could commit as if it were a fix.
        A *timeout* is the opposite case — that work is real and is kept.
        Untracked files are left alone: deleting files nobody asked us to delete
        is worse than reporting them.
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


async def _kill_group(process: asyncio.subprocess.Process) -> None:
    """Kill the whole group: an agent CLI spawns children of its own."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        if process.returncode is not None:
            return
        try:
            os.killpg(os.getpgid(process.pid), sig)
        except (ProcessLookupError, PermissionError):
            process.kill()
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
            return
        except asyncio.TimeoutError:
            continue


def _tail(path: Path, limit: int) -> str:
    """Last ``limit`` characters — an agent CLI puts its summary at the end."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[-limit:] if len(text) > limit else text


def _scrub(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


def _has_marker(text: str, markers: tuple[str, ...]) -> bool:
    """Detect a failure the CLI reported in prose while still exiting 0.

    kiro-cli 2.16.2 exits 0 on an authentication failure, so the exit code alone
    would report a false success — the worst outcome for an automated flow.
    """
    return any(marker in text for marker in markers)
