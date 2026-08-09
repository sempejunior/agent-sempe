"""Closing a question, when it is a person who answered.

The agent closing its own question is a plain repository write — it is mid-turn and
carries on by itself. A *person* answering is different: the work that needed the
answer stopped some time ago, in a conversation nobody is looking at. So this
records the answer and then wakes that conversation, which is the same mechanism a
finished background job uses.

Answering is the only write here. Un-parking whatever the answer unblocks is the
agent's job, from inside the resumed turn, because only the agent knows what was
blocked — the register holds a label and a link, deliberately not a foreign key.
"""

from __future__ import annotations

import asyncio
from typing import Any

from nanobot.jobs.delivery import WebPush
from nanobot.jobs.resume import resume_conversation


class QuestionService:
    """Record a human answer and resume what was waiting on it."""

    def __init__(
        self, *, repos: Any, agent: Any, bus: Any, push_web: WebPush | None = None,
    ):
        self._repos = repos
        self._agent = agent
        self._bus = bus
        self._push_web = push_web
        self._resumes: set[asyncio.Task] = set()

    async def answer_from_human(
        self, user_id: str, question_id: int, answer: str,
    ) -> dict[str, Any] | None:
        """Close the question and wake the conversation it stalled.

        The resume runs detached on purpose: it is a full agent turn, which can
        take minutes, and whoever answered is sitting in front of a button. Doing
        it inline holds the HTTP request open for the whole turn and the panel
        looks frozen — the same mistake the background job exists to avoid.

        Returns the closed row, or None when the question was not open — which is
        what a second person answering the same thing gets, instead of a second
        resumed turn.
        """
        row = await self._repos.questions.answer(
            user_id, question_id, answer=answer, answered_by="human",
        )
        if not row:
            return None
        task = asyncio.create_task(self._resume(user_id, question_id, row))
        self._resumes.add(task)
        task.add_done_callback(self._resumes.discard)
        return row

    async def _resume(
        self, user_id: str, question_id: int, row: dict[str, Any],
    ) -> None:
        await resume_conversation(
            agent=self._agent, bus=self._bus, repos=self._repos,
            push_web=self._push_web,
            user_id=user_id, agent_id=row.get("agent_id") or "",
            origin_channel=row.get("origin_channel") or "",
            origin_chat_id=row.get("origin_chat_id") or "",
            message=_answer_prompt(row),
            ref=f"pendencia-{question_id}",
            audit_event="question.answered",
            audit_detail={
                "question_id": question_id,
                "subject_ref": row.get("subject_ref", ""),
            },
        )


def _answer_prompt(row: dict[str, Any]) -> str:
    subject = row.get("subject") or row.get("subject_ref") or "o assunto em aberto"
    lines = [
        f"[sistema] Chegou a resposta da pergunta que você deixou em aberto sobre "
        f"{subject}.",
        f"Sua pergunta: {row.get('question', '')}",
        f"Resposta: {row.get('answer', '')}",
    ]
    if row.get("subject_url"):
        lines.append(f"Assunto: {row['subject_url']}")
    lines.append(
        "Retome o trabalho que estava parado por causa disso, usando o histórico "
        "desta conversa, e tire o item do estado de espera no registro que você "
        "estiver usando."
    )
    lines.append(
        "Se a resposta te deu liberdade para decidir — 'use seu julgamento', "
        "'liberdade criativa', 'você escolhe', ou simplesmente não fixou o "
        "detalhe — então a decisão passou a ser sua: **decida, declare a premissa "
        "que adotou e siga em frente**. Perguntar de novo depois de receber "
        "latitude é devolver o trabalho para quem já o delegou. Só volte a "
        "perguntar se faltar um fato que você não tem como obter nem decidir "
        "(uma credencial, um dado que só existe na cabeça de alguém, uma regra "
        "com consequência legal ou financeira) — nunca para confirmar uma "
        "escolha que já é sua, e nunca a mesma pergunta com outras palavras."
    )
    return "\n\n".join(lines)
