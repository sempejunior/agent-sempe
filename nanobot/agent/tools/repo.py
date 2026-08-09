"""Git plumbing for the agent, with the credential kept away from the model.

Everything up to ``push`` is plain git and identical on GitLab, GitHub and Azure
Repos — only *opening the pull request* is provider-specific, and that is an
``http_call`` endpoint declared in the integration catalog. So this tool does git
and nothing else: no ``merge``, no ``open_pr``.

The secret never reaches the model, ``argv`` (visible in ``ps``) or
``.git/config``. The remote URL carries only the username; the token is answered
to git by an askpass helper reading it from the child's environment, and any
occurrence of it is scrubbed from the output before returning.

"Always a branch and a pull request, never a merge" is enforced here rather than
asked for in a prompt: ``branch``, ``commit`` and ``push`` refuse the protected
branches (see ``branches.py``) — the default branch git reports, plus the
convention names like ``develop`` that no remote publishes.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

from nanobot.agent import notes
from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.branches import is_protected, protected_names
from nanobot.agent.tools.process import kill_process_group
from nanobot.integrations.catalog import CATALOG, get_integration

_ASKPASS = "/usr/local/bin/nanobot-git-askpass"
_BOT_NAME = "Solides Agent"
_BOT_EMAIL = "agent@solides.local"
_MAX_OUTPUT_CHARS = 8_000
_TIMEOUT_S = 600
_SLUG_RE = re.compile(r"[^A-Za-z0-9_.-]+")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]{1,120}$")

_ACTIONS = ("ensure", "status", "diff", "branch", "commit", "push")


def git_origins() -> tuple[str, ...]:
    """Integration ids that declare a git remote, derived from the catalog."""
    return tuple(entry.id for entry in CATALOG if entry.git)


class RepoTool(Tool):
    """Clone, branch, inspect and push repositories of activated integrations."""

    parallel_safe = False
    """Git commands mutate one working tree; a concurrent batch is a race on it."""

    def __init__(self, *, user_id: str, integration_repo: Any, credential_repo: Any,
                 agent_dir: Path):
        self._user_id = user_id
        self._integration_repo = integration_repo
        self._credential_repo = credential_repo
        self._root = agent_dir / "repos"

    @property
    def name(self) -> str:
        return "repo"

    @property
    def description(self) -> str:
        return (
            "Trabalha com repositórios de código das integrações ativas (GitLab, "
            "GitHub, Azure Repos). Ações: ensure (clona ou atualiza), status, diff, "
            "branch, commit, push. Não faz merge e não abre o pull request — para "
            "abrir o PR/MR use http_call no endpoint da integração. Nunca commita "
            "nem envia para main, master, develop ou o branch default: crie um "
            "branch de trabalho por demanda."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": list(_ACTIONS),
                           "description": "O que fazer."},
                "origin": {
                    "type": "string",
                    "description": "Slug da integração de origem (ex: gitlab). "
                                   "Obrigatório em ensure.",
                },
                "path": {
                    "type": "string",
                    "description": "Caminho do repositório na origem, como "
                                   "'grupo/subgrupo/projeto' ou 'owner/repo'. "
                                   "Obrigatório em ensure.",
                },
                "repo": {
                    "type": "string",
                    "description": "Repositório local devolvido por ensure. "
                                   "Obrigatório nas outras ações.",
                },
                "name": {"type": "string", "description": "Nome do branch (branch)."},
                "from_ref": {
                    "type": "string",
                    "description": "Ref de origem do branch. Default: o branch "
                                   "default do repositório.",
                },
                "message": {"type": "string", "description": "Mensagem do commit."},
                "paths": {
                    "type": "array", "items": {"type": "string"},
                    "description": "Arquivos a incluir no commit. Default: tudo.",
                },
                "staged": {"type": "boolean", "description": "diff apenas do stage."},
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "", **kwargs: Any) -> str:
        if action not in _ACTIONS:
            return f"Error: ação inválida '{action}'. Use uma de: {', '.join(_ACTIONS)}"
        handler = getattr(self, f"_{action}")
        try:
            return await handler(**kwargs)
        except _RepoError as e:
            return f"Error: {e}"

    async def _ensure(self, origin: str = "", path: str = "", **_: Any) -> str:
        if not origin or not path:
            raise _RepoError("ensure precisa de origin e path")
        entry = get_integration(origin)
        if not entry or not entry.git:
            raise _RepoError(
                f"origem '{origin}' não tem repositório declarado. "
                f"Disponíveis: {', '.join(git_origins())}"
            )
        credential = await self._credential(origin)
        url = self._clone_url(entry.git, credential, path)
        secret = credential.get(entry.git.auth_secret_field, "")
        env = {"NANOBOT_GIT_PASSWORD": secret} if secret else {}

        local = self._root / origin / _slug(path)
        fresh = not (local / ".git").is_dir()
        if fresh:
            await notes.emit(f"Clonando {path}…")
            local.parent.mkdir(parents=True, exist_ok=True)
            await self._git(["clone", url, str(local)], cwd=local.parent,
                            env=env, secret=secret)
        else:
            await notes.emit(f"Atualizando {path}…")
            await self._git(["remote", "set-url", "origin", url], cwd=local,
                            env=env, secret=secret)
            await self._git(["fetch", "--prune", "origin"], cwd=local,
                            env=env, secret=secret)

        default = await self._default_branch(local)
        head = (await self._git(["rev-parse", "--short", "HEAD"], cwd=local)).strip()
        current = (await self._git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=local)).strip()
        return json.dumps({
            "repo": str(local), "default_branch": default, "current_branch": current,
            "head": head, "cloned_now": fresh,
        }, ensure_ascii=False)

    async def _status(self, repo: str = "", **_: Any) -> str:
        local = self._local(repo)
        return await self._git(["status", "--short", "--branch"], cwd=local)

    async def _diff(self, repo: str = "", staged: bool = False, **_: Any) -> str:
        local = self._local(repo)
        args = ["diff", "--stat", "--patch"]
        if staged:
            args.insert(1, "--cached")
        out = await self._git(args, cwd=local)
        return out or "(sem alterações)"

    async def _branch(self, repo: str = "", name: str = "", from_ref: str = "",
                      **_: Any) -> str:
        local = self._local(repo)
        if not _BRANCH_RE.match(name or ""):
            raise _RepoError("nome de branch inválido")
        default = await self._default_branch(local)
        if is_protected(name, default):
            raise _RepoError(
                f"'{name}' é um branch protegido ({protected_names(default)}) — "
                "use um nome de branch de trabalho, como fix/1234-descricao"
            )
        base = from_ref or f"origin/{default}"
        await self._git(["checkout", "-B", name, base], cwd=local)
        return f"Branch '{name}' criado a partir de {base}."

    async def _commit(self, repo: str = "", message: str = "",
                      paths: list[str] | None = None, **_: Any) -> str:
        local = self._local(repo)
        if not message.strip():
            raise _RepoError("commit precisa de message")
        await self._refuse_protected(local)
        await self._git(["add", "--", *(paths or ["."])], cwd=local)
        staged = await self._git(["diff", "--cached", "--name-only"], cwd=local)
        if not staged.strip():
            raise _RepoError("nada para commitar — a árvore está limpa")
        await self._git(["commit", "-m", message], cwd=local)
        head = (await self._git(["rev-parse", "--short", "HEAD"], cwd=local)).strip()
        return f"Commit {head} criado com:\n{staged.strip()}"

    async def _push(self, repo: str = "", **_: Any) -> str:
        local = self._local(repo)
        branch = await self._refuse_protected(local)
        origin = self._origin_of(local)
        entry = get_integration(origin)
        credential = await self._credential(origin)
        secret = credential.get(entry.git.auth_secret_field, "") if entry and entry.git else ""
        env = {"NANOBOT_GIT_PASSWORD": secret} if secret else {}
        await notes.emit(f"Enviando o branch {branch} de {local.name}…")
        await self._git(["push", "--set-upstream", "origin", branch], cwd=local,
                        env=env, secret=secret)
        return f"Branch '{branch}' enviado. Abra o PR/MR com http_call."

    def _local(self, repo: str) -> Path:
        if not repo:
            raise _RepoError("informe o repo devolvido por ensure")
        local = Path(repo).expanduser().resolve()
        root = self._root.resolve()
        try:
            local.relative_to(root)
        except ValueError:
            raise _RepoError(f"repo {repo} está fora de {root}") from None
        if not (local / ".git").is_dir():
            raise _RepoError(f"{repo} não é um repositório clonado — use ensure")
        return local

    def _origin_of(self, local: Path) -> str:
        return local.relative_to(self._root.resolve()).parts[0]

    async def _default_branch(self, local: Path) -> str:
        out = await self._git(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
                              cwd=local, check=False)
        if out.strip():
            return out.strip().rsplit("/", 1)[-1]
        for candidate in ("main", "master"):
            probe = await self._git(["rev-parse", "--verify", f"origin/{candidate}"],
                                   cwd=local, check=False)
            if probe.strip():
                return candidate
        return "main"

    async def _refuse_protected(self, local: Path) -> str:
        branch = (await self._git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=local)).strip()
        default = await self._default_branch(local)
        if is_protected(branch, default):
            raise _RepoError(
                f"'{branch}' é um branch protegido ({protected_names(default)}) — "
                "crie um branch de trabalho para a demanda antes de commitar ou enviar"
            )
        return branch

    async def _credential(self, origin: str) -> dict[str, str]:
        from nanobot.utils.crypto import decrypt
        row = await self._integration_repo.get_integration(self._user_id, origin)
        if not row:
            for candidate in await self._integration_repo.list_integrations(
                self._user_id, enabled_only=True,
            ):
                if candidate.get("system_integration_id") == origin:
                    row = candidate
                    break
        if not row or not row.get("credential_id"):
            raise _RepoError(f"integração '{origin}' não está ativa para este usuário")
        cred = await self._credential_repo.get_credential(self._user_id, row["credential_id"])
        cipher = (cred or {}).get("secret_cipher", "")
        if not cipher:
            raise _RepoError(f"integração '{origin}' não tem credencial cadastrada")
        try:
            data = json.loads(decrypt(cipher))
        except (ValueError, TypeError):
            raise _RepoError(f"credencial de '{origin}' ilegível") from None
        return {k: str(v) for k, v in data.items()}

    @staticmethod
    def _clone_url(spec: Any, credential: dict[str, str], path: str) -> str:
        clean = path.strip().strip("/")
        if ".." in clean or clean.startswith("http"):
            raise _RepoError(f"path de repositório inválido: {path!r}")
        values = {**credential, "path": clean}
        values.pop(spec.auth_secret_field, None)
        for key in ("base_url",):
            if key in values:
                values[key] = values[key].rstrip("/")
        try:
            url = spec.clone_url_template.format(**values)
        except KeyError as e:
            raise _RepoError(f"credencial não tem o campo {e} exigido pela origem") from None
        if spec.auth_username and url.startswith(("http://", "https://")):
            scheme, rest = url.split("://", 1)
            url = f"{scheme}://{spec.auth_username}@{rest}"
        return url

    async def _git(self, args: list[str], *, cwd: Path, env: dict[str, str] | None = None,
                   secret: str = "", check: bool = True) -> str:
        child_env = {
            key: os.environ[key]
            for key in ("PATH", "HOME", "LANG", "LC_ALL", "TZ")
            if key in os.environ
        }
        child_env.update({
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_ASKPASS": _ASKPASS,
            "GIT_AUTHOR_NAME": _BOT_NAME,
            "GIT_AUTHOR_EMAIL": _BOT_EMAIL,
            "GIT_COMMITTER_NAME": _BOT_NAME,
            "GIT_COMMITTER_EMAIL": _BOT_EMAIL,
        })
        child_env.update(env or {})
        process = await asyncio.create_subprocess_exec(
            "git", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(cwd),
            env=child_env,
            start_new_session=True,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=_TIMEOUT_S)
        except asyncio.TimeoutError:
            await kill_process_group(process)
            raise _RepoError(f"git {args[0]} passou de {_TIMEOUT_S}s") from None
        except asyncio.CancelledError:
            await kill_process_group(process)
            raise
        out = _scrub(stdout.decode("utf-8", errors="replace"), secret)
        if len(out) > _MAX_OUTPUT_CHARS:
            out = out[:_MAX_OUTPUT_CHARS] + "\n... (saída truncada)"
        if check and process.returncode != 0:
            raise _RepoError(f"git {args[0]} falhou: {out.strip()}")
        return out


class _RepoError(Exception):
    """Expected, explainable failure — reported to the model, never raised out."""


def _slug(path: str) -> str:
    return _SLUG_RE.sub("-", path.strip("/")).strip("-").lower() or "repo"


def _scrub(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text
