"""One timeline out of the four registers that record an agent's work.

The product recorded work in four places that never met: questions waiting on a
person, background jobs, demands with their pull requests, and published pages.
Each had its own API and only the first reached the screen, so a report
delivered yesterday existed solely in the conversation that produced it and a
finished delegation was visible only to whoever still had the chat open.

This assembles them into three buckets, ordered by what the person has to do
about them: what is waiting on you, what is running, what is done. Every entry
has the same shape so the screen renders one thing instead of four, and carries
its links — a merge request, a report page — because the link is the delivery.
"""

from __future__ import annotations

from typing import Any

_UNFINISHED_JOBS = ("queued", "running")
_JOB_OUTCOMES = {
    "done": "Concluída",
    "failed": "Falhou",
    "timeout": "Interrompida pelo teto de tempo",
    "interrupted": "Cancelada antes de terminar",
}
_DELIVERED_LIMIT = 40


def _item(
    *, id: str, kind: str, title: str, at: str, detail: str = "", agent_id: str = "",
    links: list[dict[str, str]] | None = None, job_id: str = "",
    question: dict[str, Any] | None = None, origin: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": id, "kind": kind, "title": title, "detail": detail,
        "agent_id": agent_id, "at": at, "links": links or [],
        "job_id": job_id, "question": question,
        "session_key": _session_key(origin or {}),
    }


def _session_key(row: dict[str, Any]) -> str:
    """The conversation this came out of, when it came out of one.

    Reuses the rule the resume path already follows: work started in a chat
    carries the channel and the chat id, and the session key is the two joined.
    Work with no conversation behind it (a routine, a sweep) has none, and the
    screen must not offer to open one.
    """
    channel = (row.get("origin_channel") or "").strip()
    chat_id = (row.get("origin_chat_id") or "").strip()
    if channel != "web" or not chat_id:
        return ""
    return f"web:{chat_id}"


async def build_activity(repos: Any, user_id: str) -> dict[str, list[dict[str, Any]]]:
    """The three buckets, each already ordered for reading."""
    questions = await repos.questions.list_questions(user_id, state=None)
    jobs = await repos.jobs.list_jobs(user_id, state=None)
    demands = await repos.work_items.list_items(user_id, state=None)
    deliverables = await repos.deliverables.list_deliverables(user_id)

    waiting = [_from_open_question(q) for q in questions if q.get("state") == "open"]
    running = [_from_running_job(j) for j in jobs if j.get("state") in _UNFINISHED_JOBS]
    delivered = [
        *(_from_deliverable(d) for d in deliverables),
        *(item for demand in demands for item in _from_demand(demand)),
        *(_from_finished_job(j) for j in jobs if j.get("state") not in _UNFINISHED_JOBS),
        *(_from_closed_question(q) for q in questions if q.get("state") != "open"),
    ]
    delivered.sort(key=lambda entry: entry["at"], reverse=True)

    return {
        "waiting": sorted(waiting, key=lambda entry: entry["at"]),
        "running": sorted(running, key=lambda entry: entry["at"]),
        "delivered": delivered[:_DELIVERED_LIMIT],
    }


def _from_open_question(row: dict[str, Any]) -> dict[str, Any]:
    links = []
    if row.get("subject_url"):
        links.append({"label": row.get("subject") or "Ver assunto",
                      "url": row["subject_url"]})
    return _item(
        id=f"question-{row['id']}", kind="question",
        title=row.get("question", ""), detail=row.get("context", "") or "",
        agent_id=row.get("agent_id", "") or "",
        at=row.get("created_at", "") or "", links=links, question=row, origin=row,
    )


def _from_closed_question(row: dict[str, Any]) -> dict[str, Any]:
    answered = row.get("state") == "answered"
    who = "Você respondeu" if row.get("answered_by") == "human" else "O agente resolveu"
    return _item(
        id=f"question-{row['id']}", kind="answer",
        title=row.get("question", ""),
        detail=f"{who}: {row.get('answer', '')}" if answered else "Descartada",
        agent_id=row.get("agent_id", "") or "",
        at=row.get("answered_at") or row.get("created_at", "") or "",
        origin=row,
    )


def _from_running_job(row: dict[str, Any]) -> dict[str, Any]:
    return _item(
        id=f"job-{row['job_id']}", kind="job",
        title=row.get("label") or row.get("kind", "tarefa"),
        detail="Na fila" if row.get("state") == "queued" else "Em execução",
        agent_id=row.get("agent_id", "") or "",
        at=row.get("started_at") or row.get("created_at", "") or "",
        job_id=row.get("job_id", ""), origin=row,
    )


def _from_finished_job(row: dict[str, Any]) -> dict[str, Any]:
    outcome = _JOB_OUTCOMES.get(row.get("state", ""), row.get("state", ""))
    return _item(
        id=f"job-{row['job_id']}", kind="job",
        title=row.get("label") or row.get("kind", "tarefa"),
        detail=f"{outcome}. {row.get('result') or row.get('error') or ''}".strip(),
        agent_id=row.get("agent_id", "") or "",
        at=row.get("finished_at") or row.get("created_at", "") or "",
        job_id=row.get("job_id", ""), origin=row,
    )


def _from_demand(row: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per repository that already has a pull request.

    A demand with two repositories is two deliveries, and dating them by the
    repository is what keeps the second PR from being filed under the first
    one's date.
    """
    reference = f"{row.get('source', '')}#{row.get('external_id', '')}"
    entries = []
    for entry in row.get("repos", []):
        if not entry.get("pr_url"):
            continue
        entries.append(_item(
            id=f"demand-{row['id']}-{entry['id']}", kind="demand",
            title=f"{reference} — {entry.get('repo', '')}",
            detail=row.get("title", "") or "",
            agent_id=row.get("agent_id", "") or "",
            at=entry.get("updated_at", "") or row.get("updated_at", "") or "",
            links=[{"label": "Abrir PR", "url": entry["pr_url"]}],
            origin=row,
        ))
    return entries


def _from_deliverable(row: dict[str, Any]) -> dict[str, Any]:
    return _item(
        id=f"page-{row['id']}", kind="page",
        title=row.get("title", "") or "Página publicada",
        detail="Relatório" if row.get("kind") == "report" else "Página",
        agent_id=row.get("agent_id", "") or "",
        at=row.get("created_at", "") or "",
        links=[{"label": "Abrir", "url": row.get("url", "")}],
        origin=row,
    )
