"""Keep track of which demands were already worked, across routine executions.

A routine that sweeps a board every day has no memory of yesterday: routines
share one conversation session, its window is finite, tool results are truncated
when persisted, and a run killed by its timeout leaves no history at all. Without
a ledger the routine opens a second pull request for a demand it already fixed.

The claim is an insert against a unique key, so two executions running at the
same time cannot both take the same demand. Completing requires the pull request
URL: an item with no PR never reaches ``done``, which is what keeps a delegation
that quietly failed from being recorded as delivered.

``waiting`` is not a kind of failure and the difference is load-bearing: a failure
is something the machine may retry, while an item waiting on a person's decision
would only fail again. A parked item is refused by ``claim``, so tomorrow's sweep
skips it rather than redoing work whose whole problem was a missing answer.

A demand is not a pull request. One demand can legitimately need a change in the
backend and another in the frontend, so the repositories are declared with
``link`` and completed one by one: the demand closes only when every repository
it declared has a PR.
"""

from __future__ import annotations

from typing import Any

from nanobot.agent.tools.base import Tool

_ACTIONS = ("claim", "link", "complete", "fail", "wait", "resume", "list")
_DEFAULT_STALE_AFTER_S = 3600


class WorkLedgerTool(Tool):
    """Claim a demand before working it, and record what came out."""

    def __init__(self, *, user_id: str, work_item_repo: Any, agent_id: str = "",
                 stale_after_s: int = _DEFAULT_STALE_AFTER_S):
        self._user_id = user_id
        self._repo = work_item_repo
        self._agent_id = agent_id
        self._stale_after_s = stale_after_s
        self._origin_channel = ""
        self._origin_chat_id = ""

    def set_origin(self, *, channel: str = "", chat_id: str = "",
                   user_id: str = "", agent_id: str = "", **_: Any) -> None:
        """Remember where the demand was picked up, so it can be reopened."""
        self._origin_channel = channel
        self._origin_chat_id = chat_id
        self._agent_id = agent_id or self._agent_id

    @property
    def name(self) -> str:
        return "work_ledger"

    @property
    def description(self) -> str:
        return (
            "Registro do que já foi trabalhado, para não fazer duas vezes. Antes "
            "de trabalhar uma demanda, chame com action='claim': se voltar "
            "'PULE', não trabalhe esse item. Ao criar o branch de cada "
            "repositório que a demanda toca, chame action='link' com repo e "
            "branch — uma demanda pode exigir mais de um repositório. Ao abrir o "
            "PR de um repositório, action='complete' com repo e a URL do PR; a "
            "demanda só fecha quando todo repositório declarado tem PR. "
            "action='fail' com o motivo quando não deu. Se o que falta é a "
            "resposta de uma pessoa, use action='wait' — não é falha, e o item "
            "para de ser reservado até alguém responder; quando a resposta "
            "chegar, action='resume' devolve ele ao trabalho. action='list' "
            "mostra o histórico."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string", "enum": list(_ACTIONS),
                    "description": "claim antes de trabalhar; link ao criar o branch "
                                   "de cada repositório; complete ao abrir o PR de um "
                                   "repositório; fail quando não deu; wait quando "
                                   "falta a resposta de uma pessoa; resume quando a "
                                   "resposta chegou; list para ver o histórico.",
                },
                "source": {
                    "type": "string",
                    "description": "De onde vem a demanda: azure, jira, github, "
                                   "ou o nome do rastreador do cliente.",
                },
                "external_id": {
                    "type": "string",
                    "description": "Id da demanda no rastreador (ex: 41234).",
                },
                "title": {
                    "type": "string",
                    "description": "Título da demanda, para o registro ficar legível.",
                },
                "repo": {
                    "type": "string",
                    "description": "Repositório afetado, como ele é conhecido na "
                                   "origem (ex: grupo/subgrupo/projeto). "
                                   "Obrigatório no link e no complete.",
                },
                "pr_url": {
                    "type": "string",
                    "description": "URL do PR/MR aberto para esse repositório — "
                                   "obrigatório no complete.",
                },
                "branch": {
                    "type": "string",
                    "description": "Branch de trabalho criado nesse repositório — "
                                   "obrigatório no link.",
                },
                "note": {
                    "type": "string",
                    "description": "No fail, o motivo. No wait, o que está sendo "
                                   "esperado e de quem. No complete, o resumo do "
                                   "que foi feito e como foi verificado.",
                },
                "state": {
                    "type": "string",
                    "description": "No list, filtra por estado (claimed, waiting, "
                                   "done, failed, skipped).",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "", source: str = "", external_id: str = "",
                      title: str = "", repo: str = "", pr_url: str = "",
                      branch: str = "", note: str = "", state: str = "",
                      **_: Any) -> str:
        action = action.strip().lower()
        if action not in _ACTIONS:
            return f"Error: action deve ser uma de {', '.join(_ACTIONS)}."
        if action == "list":
            return await self._list(state)

        source = source.strip().lower()
        external_id = str(external_id).strip()
        if not source or not external_id:
            return "Error: source e external_id são obrigatórios."

        if action == "claim":
            return await self._claim(source, external_id, title)
        if action == "link":
            return await self._link(source, external_id, repo, branch)
        if action == "complete":
            return await self._complete(source, external_id, repo, pr_url, note)
        if action == "wait":
            return await self._wait(source, external_id, note)
        if action == "resume":
            return await self._resume(source, external_id, note)
        return await self._fail(source, external_id, note)

    async def _claim(self, source: str, external_id: str, title: str) -> str:
        result = await self._repo.claim(
            self._user_id, source=source, external_id=external_id,
            agent_id=self._agent_id, title=title.strip(),
            stale_after_s=self._stale_after_s,
            origin_channel=self._origin_channel, origin_chat_id=self._origin_chat_id,
        )
        reference = f"{source}#{external_id}"
        if result.get("claimed"):
            return (f"Claim de {reference} concedido ({result.get('reason', '')}). "
                    "Identifique todos os repositórios que a demanda toca e registre "
                    "cada um com action='link' ao criar o branch dele. No fim, "
                    "complete por repositório, ou fail.")
        details = []
        if result.get("pr_urls"):
            details.append(f"PRs: {', '.join(result['pr_urls'])}")
        if result.get("note"):
            details.append(result["note"])
        suffix = f" {' | '.join(details)}" if details else ""
        return (f"PULE {reference}: {result.get('reason', 'já registrado')}."
                f"{suffix}")

    async def _link(self, source: str, external_id: str, repo: str, branch: str) -> str:
        if not repo.strip() or not branch.strip():
            return ("Error: link precisa de repo e branch — é o que registra qual "
                    "repositório a demanda toca e em que branch você está nele.")
        result = await self._repo.link_repo(
            self._user_id, source=source, external_id=external_id,
            repo=repo.strip(), branch=branch.strip(),
        )
        if not result.get("linked"):
            reason = result.get("reason", "não foi possível registrar")
            if "não está no registro" in reason:
                return (f"Error: {source}#{external_id} não está no registro — "
                        "faça claim antes de registrar repositórios.")
            return (f"{repo.strip()} já estava registrado nesta demanda: {reason}. "
                    "Uma demanda tem um branch por repositório — use o que já existe.")
        declared = ", ".join(r["repo"] for r in result.get("repos", []))
        return (f"{repo.strip()} registrado em {source}#{external_id} no branch "
                f"{branch.strip()}. Repositórios desta demanda: {declared}.")

    async def _complete(self, source: str, external_id: str, repo: str,
                        pr_url: str, note: str) -> str:
        if not repo.strip():
            return ("Error: repo é obrigatório no complete — o PR é de um "
                    "repositório, e a demanda pode ter mais de um.")
        if not pr_url.strip():
            return ("Error: pr_url é obrigatória no complete. Sem PR aberto o item "
                    "não está concluído — se não deu para abrir, use fail com o motivo.")
        result = await self._repo.complete_repo(
            self._user_id, source=source, external_id=external_id,
            repo=repo.strip(), pr_url=pr_url.strip(), note=note.strip(),
        )
        if not result.get("recorded"):
            reason = result.get("reason", "")
            if "não declarado" in reason:
                return (f"Error: {repo.strip()} não está declarado em "
                        f"{source}#{external_id} — chame action='link' com o repo e o "
                        "branch antes de concluir.")
            return (f"Error: {source}#{external_id} não está no registro — "
                    "faça claim antes de concluir.")
        if result.get("closed"):
            return (f"{source}#{external_id} concluído: {result['total']} "
                    f"repositório(s) com PR. Último: {pr_url.strip()}")
        pending = [r["repo"] for r in result.get("repos", []) if not r["pr_url"]]
        return (f"PR de {repo.strip()} registrado ({result['with_pr']}/"
                f"{result['total']} repositórios). A demanda continua aberta — "
                f"falta o PR de: {', '.join(pending)}.")

    async def _wait(self, source: str, external_id: str, note: str) -> str:
        if not note.strip():
            return ("Error: note é obrigatória no wait — diga o que está sendo "
                    "esperado e de quem.")
        ok = await self._repo.wait(
            self._user_id, source=source, external_id=external_id, note=note.strip(),
        )
        if not ok:
            return (f"Error: {source}#{external_id} não está no registro — "
                    "faça claim antes de marcar como aguardando.")
        return (f"{source}#{external_id} aguardando resposta: {note.strip()}. "
                "Nenhuma execução vai reservar este item até alguém responder — "
                "siga para o próximo.")

    async def _resume(self, source: str, external_id: str, note: str) -> str:
        ok = await self._repo.resume(
            self._user_id, source=source, external_id=external_id, note=note.strip(),
        )
        if not ok:
            return (f"Error: {source}#{external_id} não está aguardando resposta — "
                    "use action='list' para ver em que estado ele está.")
        return (f"{source}#{external_id} voltou ao trabalho e está reservado para "
                "você. Termine com complete ou fail.")

    async def _fail(self, source: str, external_id: str, note: str) -> str:
        if not note.strip():
            return "Error: note é obrigatória no fail — diga o que impediu."
        ok = await self._repo.fail(
            self._user_id, source=source, external_id=external_id, note=note.strip(),
        )
        if not ok:
            return (f"Error: {source}#{external_id} não está no registro — "
                    "faça claim antes de registrar falha.")
        return (f"{source}#{external_id} marcado como falha: {note.strip()}. "
                "Uma execução futura pode tentar de novo.")

    async def _list(self, state: str) -> str:
        items = await self._repo.list_items(
            self._user_id, state=state.strip().lower() or None,
        )
        if not items:
            return "Nenhuma demanda registrada ainda."
        lines: list[str] = []
        for item in items:
            lines.append(
                f"- {item['source']}#{item['external_id']} [{item['state']}]"
                f" {item.get('title') or ''}".rstrip()
            )
            for entry in item.get("repos", []):
                pr = entry["pr_url"] or "sem PR"
                lines.append(
                    f"    {entry['repo'] or '(repositório não registrado)'} "
                    f"({entry['branch'] or 'sem branch'}) -> {pr}"
                )
        return "\n".join(lines)
