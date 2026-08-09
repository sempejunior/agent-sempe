"""Hand a decision back to a person, and get on with the rest of the work.

An agent that hits a decision it has no business making has three bad options and
one good one. The bad ones: guess, stop everything, or record a failure. Guessing
produces confident wrong work; stopping wastes the other eleven items it could
have done; recording a failure loses the distinction between "the machine can try
again" and "a person has to say something first".

The good one is this: write down what is missing and where to find it, leave the
question wherever the person will actually look, and move on. The register is what
makes the question findable later — without it, a question asked at 3am in a
comment on some board is a question nobody knows exists.

Answering is deliberately split in two. When the agent finds the answer itself —
it read the comments on the demand — it records the answer here and carries on in
the same turn. When a *person* answers, that goes through the service, because
then there is a stalled conversation to wake up.
"""

from __future__ import annotations

from typing import Any

from nanobot.agent import notes
from nanobot.agent.tools.base import Tool

_ACTIONS = ("ask", "list", "answer", "cancel")


class AskHumanTool(Tool):
    """Register, list, answer and drop questions waiting on a person."""

    def __init__(self, *, user_id: str, question_repo: Any, agent_id: str = ""):
        self._user_id = user_id
        self._repo = question_repo
        self._agent_id = agent_id
        self._origin_channel = ""
        self._origin_chat_id = ""

    def set_origin(self, *, channel: str = "", chat_id: str = "",
                   user_id: str = "", agent_id: str = "", **_: Any) -> None:
        """Remember the conversation, so an answer knows what to resume."""
        self._origin_channel = channel
        self._origin_chat_id = chat_id
        self._agent_id = agent_id or self._agent_id

    @property
    def name(self) -> str:
        return "ask_human"

    @property
    def description(self) -> str:
        return (
            "Registra que você precisa da resposta de uma pessoa para continuar, e "
            "libera você para seguir com o resto. Use quando falta uma decisão que "
            "não é sua: uma regra de negócio, qual comportamento é o correto, uma "
            "aprovação, um dado que não está no pedido. NÃO é registro de falha — "
            "falha é o que a máquina pode tentar de novo; isto espera uma pessoa. "
            "Preencha subject e subject_url para quem for responder saber do que se "
            "trata e conseguir abrir o assunto. Se você estiver conversando com "
            "alguém agora, faça a pergunta também na sua resposta. action='list' "
            "mostra o que está em aberto; action='answer' registra a resposta que "
            "você mesmo encontrou (num comentário, por exemplo); action='cancel' "
            "descarta uma pergunta que deixou de importar."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string", "enum": list(_ACTIONS),
                    "description": "Padrão é ask. list, answer ou cancel para o resto.",
                },
                "question": {
                    "type": "string",
                    "description": "A pergunta, em uma frase, do jeito que a pessoa "
                                   "consegue responder sem abrir o código.",
                },
                "context": {
                    "type": "string",
                    "description": "O que você estava fazendo e por que isso trava — "
                                   "o suficiente para a pessoa decidir.",
                },
                "subject": {
                    "type": "string",
                    "description": "O que está parado, em texto curto e reconhecível "
                                   "(ex: 'Bug #41234 cadastro em massa').",
                },
                "subject_url": {
                    "type": "string",
                    "description": "Link para a pessoa abrir o assunto (a demanda, o "
                                   "documento, o PR). Vale muito: sem ele quem "
                                   "responde tem que caçar do que se trata.",
                },
                "subject_ref": {
                    "type": "string",
                    "description": "Identificador curto e estável do assunto (ex: "
                                   "'azure#41234'). É o que evita registrar a mesma "
                                   "pergunta duas vezes em execuções diferentes.",
                },
                "asked_where": {
                    "type": "string",
                    "description": "Onde você deixou a pergunta para a pessoa ver "
                                   "(ex: 'comentário na demanda', 'no chat').",
                },
                "question_id": {
                    "type": "integer",
                    "description": "Id da pergunta, obrigatório em answer e cancel.",
                },
                "answer": {
                    "type": "string",
                    "description": "No answer, a resposta que você encontrou.",
                },
                "state": {
                    "type": "string",
                    "description": "No list, filtra por estado (open, answered, "
                                   "cancelled). Padrão open.",
                },
            },
            "required": [],
        }

    async def execute(self, action: str = "ask", question: str = "", context: str = "",
                      subject: str = "", subject_url: str = "", subject_ref: str = "",
                      asked_where: str = "", question_id: int | None = None,
                      answer: str = "", state: str = "", **_: Any) -> str:
        action = (action or "ask").strip().lower()
        if action not in _ACTIONS:
            return f"Error: action deve ser uma de {', '.join(_ACTIONS)}."
        if action == "list":
            return await self._list(state)
        if action == "ask":
            return await self._ask(question, context, subject, subject_url,
                                  subject_ref, asked_where)
        if question_id is None:
            return f"Error: question_id é obrigatório em {action}."
        if action == "answer":
            return await self._answer(int(question_id), answer)
        return await self._cancel(int(question_id))

    async def _ask(self, question: str, context: str, subject: str, subject_url: str,
                   subject_ref: str, asked_where: str) -> str:
        if not question.strip():
            return "Error: question é obrigatória — diga o que falta saber."
        row = await self._repo.ask(
            self._user_id, question=question.strip(), agent_id=self._agent_id,
            context=context.strip(), subject=subject.strip(),
            subject_url=subject_url.strip(), subject_ref=subject_ref.strip().lower(),
            asked_where=asked_where.strip(),
            origin_channel=self._origin_channel, origin_chat_id=self._origin_chat_id,
        )
        reference = f"pendência {row.get('id')}"
        if not row.get("created"):
            return (f"Essa pergunta já estava em aberto ({reference}, desde "
                    f"{row.get('created_at', '?')}). Não pergunte de novo — siga "
                    "para o próximo item.")
        await notes.alert("question", f"O agente precisa de uma resposta: {question.strip()}")
        return (f"Registrado: {reference}. Está aguardando resposta e aparece na "
                "caixa de pendências. Não fique esperando: siga com o resto do "
                "trabalho. Quando alguém responder, você recebe a resposta e "
                "retoma daqui.")

    async def _answer(self, question_id: int, answer: str) -> str:
        if not answer.strip():
            return "Error: answer é obrigatória — diga qual foi a resposta."
        row = await self._repo.answer(
            self._user_id, question_id, answer=answer.strip(), answered_by="agent",
        )
        if not row:
            return (f"Error: pendência {question_id} não está aberta (já respondida, "
                    "descartada, ou não existe).")
        return (f"Pendência {question_id} fechada com a resposta que você encontrou. "
                "Agora dá para retomar o que estava parado por causa dela.")

    async def _cancel(self, question_id: int) -> str:
        if await self._repo.cancel(self._user_id, question_id):
            return f"Pendência {question_id} descartada."
        return f"Error: pendência {question_id} não está aberta."

    async def _list(self, state: str) -> str:
        rows = await self._repo.list_questions(
            self._user_id, state=state.strip().lower() or "open",
        )
        if not rows:
            return "Nenhuma pendência nesse estado."
        return "\n".join(f"- {_line(row)}" for row in rows)


def _line(row: dict[str, Any]) -> str:
    subject = row.get("subject") or row.get("subject_ref") or "sem assunto"
    parts = [f"{row.get('id')} [{row.get('state')}] {subject}: {row.get('question')}"]
    if row.get("subject_url"):
        parts.append(f"({row['subject_url']})")
    if row.get("answer"):
        parts.append(f"-> {row['answer']}")
    return " ".join(parts)
