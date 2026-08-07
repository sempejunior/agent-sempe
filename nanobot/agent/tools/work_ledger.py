"""Keep track of which demands were already worked, across routine executions.

A routine that sweeps a board every day has no memory of yesterday: routines
share one conversation session, its window is finite, tool results are truncated
when persisted, and a run killed by its timeout leaves no history at all. Without
a ledger the routine opens a second pull request for a demand it already fixed.

The claim is an insert against a unique key, so two executions running at the
same time cannot both take the same demand. Completing requires the pull request
URL: an item with no PR never reaches ``done``, which is what keeps a delegation
that quietly failed from being recorded as delivered.
"""

from __future__ import annotations

from typing import Any

from nanobot.agent.tools.base import Tool

_ACTIONS = ("claim", "complete", "fail", "list")
_DEFAULT_STALE_AFTER_S = 3600


class WorkLedgerTool(Tool):
    """Claim a demand before working it, and record what came out."""

    def __init__(self, *, user_id: str, work_item_repo: Any, agent_id: str = "",
                 stale_after_s: int = _DEFAULT_STALE_AFTER_S):
        self._user_id = user_id
        self._repo = work_item_repo
        self._agent_id = agent_id
        self._stale_after_s = stale_after_s

    @property
    def name(self) -> str:
        return "work_ledger"

    @property
    def description(self) -> str:
        return (
            "Registro do que já foi trabalhado, para não fazer duas vezes. Antes "
            "de trabalhar uma demanda, chame com action='claim': se voltar "
            "'já feito' ou 'outra execução está trabalhando', pule esse item. "
            "Ao terminar, action='complete' com a URL do PR (sem PR o item não "
            "fica concluído), ou action='fail' com o motivo. action='list' "
            "mostra o histórico. Use em rotinas que varrem demandas."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string", "enum": list(_ACTIONS),
                    "description": "claim antes de trabalhar; complete ou fail ao "
                                   "terminar; list para ver o histórico.",
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
                "pr_url": {
                    "type": "string",
                    "description": "URL do PR/MR aberto — obrigatório no complete.",
                },
                "branch": {
                    "type": "string",
                    "description": "Branch de trabalho usado.",
                },
                "note": {
                    "type": "string",
                    "description": "No fail, o motivo. No complete, o resumo do "
                                   "que foi feito e como foi verificado.",
                },
                "state": {
                    "type": "string",
                    "description": "No list, filtra por estado (claimed, done, "
                                   "failed, skipped).",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "", source: str = "", external_id: str = "",
                      title: str = "", pr_url: str = "", branch: str = "",
                      note: str = "", state: str = "", **_: Any) -> str:
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
        if action == "complete":
            return await self._complete(source, external_id, pr_url, branch, note)
        return await self._fail(source, external_id, note)

    async def _claim(self, source: str, external_id: str, title: str) -> str:
        result = await self._repo.claim(
            self._user_id, source=source, external_id=external_id,
            agent_id=self._agent_id, title=title.strip(),
            stale_after_s=self._stale_after_s,
        )
        reference = f"{source}#{external_id}"
        if result.get("claimed"):
            return (f"Claim de {reference} concedido ({result.get('reason', '')}). "
                    "Trabalhe este item e no fim registre complete ou fail.")
        details = []
        if result.get("pr_url"):
            details.append(f"PR: {result['pr_url']}")
        if result.get("note"):
            details.append(result["note"])
        suffix = f" {' | '.join(details)}" if details else ""
        return (f"PULE {reference}: {result.get('reason', 'já registrado')}."
                f"{suffix}")

    async def _complete(self, source: str, external_id: str, pr_url: str,
                        branch: str, note: str) -> str:
        if not pr_url.strip():
            return ("Error: pr_url é obrigatória no complete. Sem PR aberto o item "
                    "não está concluído — se não deu para abrir, use fail com o motivo.")
        ok = await self._repo.complete(
            self._user_id, source=source, external_id=external_id,
            pr_url=pr_url.strip(), branch=branch.strip(), note=note.strip(),
        )
        if not ok:
            return (f"Error: {source}#{external_id} não está no registro — "
                    "faça claim antes de concluir.")
        return f"{source}#{external_id} concluído. PR: {pr_url.strip()}"

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
        lines = [
            f"- {item['source']}#{item['external_id']} [{item['state']}]"
            f" {item.get('title') or ''}".rstrip()
            + (f" -> {item['pr_url']}" if item.get("pr_url") else "")
            for item in items
        ]
        return "\n".join(lines)
