"""Client management API endpoints.

All endpoints require authentication and validate that the requesting
user owns the client being accessed.
"""

from __future__ import annotations

import json as _json
from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/clients", tags=["clients"])


async def _require_user(request: Request) -> dict[str, Any]:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    uid = auth[7:].strip()
    repos = request.app.state.repos
    user = await repos.users.get_by_id(uid)
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def _get_owned_client(request: Request, client_id: str) -> dict[str, Any]:
    user = await _require_user(request)
    client = await request.app.state.repos.clients.get(client_id)
    if not client or client.get("owner_id") != user["user_id"]:
        raise HTTPException(404, "Client not found")
    return client


# -- Client CRUD --------------------------------------------------------------


@router.get("")
async def list_clients(request: Request):
    user = await _require_user(request)
    uid = user["user_id"]
    params = request.query_params
    q = params.get("q", "").strip() or None
    status = params.get("status") or None
    limit = min(int(params.get("limit", "50")), 200)
    offset = int(params.get("offset", "0"))
    sort = params.get("sort", "last_seen")

    repos = request.app.state.repos
    clients = await repos.clients.list_by_owner(
        uid, status=status, query=q, limit=limit, offset=offset, sort=sort,
    )
    total = await repos.clients.count_by_owner(uid, status=status, query=q)

    result = []
    for c in clients:
        identities = await repos.client_identities.list_by_client(c["client_id"])
        channels = list({i["channel"] for i in identities})
        result.append({
            "client_id": c["client_id"],
            "display_name": c.get("display_name", ""),
            "status": c.get("status", "active"),
            "channels": channels,
            "first_seen": c.get("first_seen", ""),
            "last_seen": c.get("last_seen", ""),
            "total_interactions": c.get("total_interactions", 0),
        })
    return {"clients": result, "total": total}


@router.post("/merge")
async def merge_clients(request: Request):
    user = await _require_user(request)
    uid = user["user_id"]
    body = await request.json()
    primary_id = body.get("primary", "").strip()
    secondary_id = body.get("secondary", "").strip()
    if not primary_id or not secondary_id:
        raise HTTPException(400, "primary and secondary client IDs are required")
    if primary_id == secondary_id:
        raise HTTPException(400, "Cannot merge a client with itself")

    repos = request.app.state.repos
    primary = await repos.clients.get(primary_id)
    secondary = await repos.clients.get(secondary_id)
    if not primary or primary.get("owner_id") != uid:
        raise HTTPException(404, "Primary client not found")
    if not secondary or secondary.get("owner_id") != uid:
        raise HTTPException(404, "Secondary client not found")

    await repos.client_identities.reassign(secondary_id, primary_id)
    await repos.client_memories.reassign(secondary_id, primary_id)

    p_long = await repos.client_memories.get_long_term(primary_id)
    s_long = await repos.client_memories.get_long_term(secondary_id)
    if s_long and s_long != p_long:
        merged = f"{p_long}\n{s_long}" if p_long else s_long
        await repos.client_memories.save_long_term(primary_id, uid, merged)

    new_interactions = (
        primary.get("total_interactions", 0) + secondary.get("total_interactions", 0)
    )
    first_seen = min(
        primary.get("first_seen", "9999"),
        secondary.get("first_seen", "9999"),
    )
    last_seen = max(
        primary.get("last_seen", ""),
        secondary.get("last_seen", ""),
    )
    await repos.clients.update(primary_id, {
        "total_interactions": new_interactions,
        "first_seen": first_seen,
        "last_seen": last_seen,
    })

    await repos.clients.delete(secondary_id)
    return {"ok": True, "client_id": primary_id}


@router.get("/{client_id}")
async def get_client(request: Request, client_id: str):
    client = await _get_owned_client(request, client_id)
    repos = request.app.state.repos
    identities = await repos.client_identities.list_by_client(client_id)
    return {**client, "identities": identities}


@router.put("/{client_id}")
async def update_client(request: Request, client_id: str):
    await _get_owned_client(request, client_id)
    body = await request.json()
    allowed = {}
    for key in ("display_name", "metadata", "status"):
        if key in body:
            val = body[key]
            if key == "metadata" and isinstance(val, dict):
                val = _json.dumps(val)
            allowed[key] = val
    if not allowed:
        raise HTTPException(400, "No valid fields to update")
    ok = await request.app.state.repos.clients.update(client_id, allowed)
    return {"ok": ok}


@router.delete("/{client_id}")
async def delete_client(request: Request, client_id: str):
    await _get_owned_client(request, client_id)
    ok = await request.app.state.repos.clients.delete(client_id)
    return {"ok": ok}


# -- Client identity endpoints ------------------------------------------------


@router.get("/{client_id}/identities")
async def list_client_identities(request: Request, client_id: str):
    await _get_owned_client(request, client_id)
    return await request.app.state.repos.client_identities.list_by_client(client_id)


@router.post("/{client_id}/identities")
async def add_client_identity(request: Request, client_id: str):
    client = await _get_owned_client(request, client_id)
    body = await request.json()
    channel = body.get("channel", "").strip()
    external_id = body.get("external_id", "").strip()
    if not channel or not external_id:
        raise HTTPException(400, "channel and external_id are required")
    identity_id = await request.app.state.repos.client_identities.create({
        "client_id": client_id,
        "owner_id": client["owner_id"],
        "channel": channel,
        "external_id": external_id,
        "display_name": body.get("display_name", ""),
    })
    return {"ok": True, "id": identity_id}


@router.delete("/{client_id}/identities/{identity_id}")
async def delete_client_identity(request: Request, client_id: str, identity_id: int):
    await _get_owned_client(request, client_id)
    ok = await request.app.state.repos.client_identities.delete(identity_id, client_id)
    return {"ok": ok}


# -- Client memory endpoints --------------------------------------------------


@router.get("/{client_id}/memory")
async def get_client_memory(request: Request, client_id: str):
    await _get_owned_client(request, client_id)
    repos = request.app.state.repos
    long_term = await repos.client_memories.get_long_term(client_id)
    history = await repos.client_memories.get_history(client_id)
    return {"long_term": long_term, "history": history}


@router.put("/{client_id}/memory/long_term")
async def update_client_long_term(request: Request, client_id: str):
    client = await _get_owned_client(request, client_id)
    body = await request.json()
    content = body.get("content", "")
    await request.app.state.repos.client_memories.save_long_term(
        client_id, client["owner_id"], content,
    )
    return {"ok": True}


@router.delete("/{client_id}/memory")
async def clear_client_memory(request: Request, client_id: str):
    await _get_owned_client(request, client_id)
    count = await request.app.state.repos.client_memories.clear(client_id)
    return {"ok": True, "deleted": count}


@router.delete("/{client_id}/memory/{entry_id}")
async def delete_client_memory_entry(request: Request, client_id: str, entry_id: int):
    await _get_owned_client(request, client_id)
    ok = await request.app.state.repos.client_memories.delete_entry(entry_id, client_id)
    return {"ok": ok}


@router.get("/{client_id}/memory/search")
async def search_client_memory(request: Request, client_id: str, q: str = ""):
    await _get_owned_client(request, client_id)
    if not q.strip():
        return {"results": []}
    results = await request.app.state.repos.client_memories.search_history(
        client_id, q.strip(),
    )
    return {"results": results}


# -- Client recent messages ----------------------------------------------------


@router.get("/{client_id}/recent-messages")
async def list_client_recent_messages(
    request: Request, client_id: str, limit: int = 50,
):
    client = await _get_owned_client(request, client_id)
    repos = request.app.state.repos
    owner_id = client["owner_id"]
    limit = min(limit, 200)

    all_sessions = await repos.sessions.list_sessions(owner_id)
    prefix = f"client:{client_id}:"
    client_sessions = [
        s for s in all_sessions if s.get("session_key", "").startswith(prefix)
    ]

    messages: list[dict[str, Any]] = []
    for s in client_sessions:
        session = await repos.sessions.get(owner_id, s["session_key"])
        if not session:
            continue
        msgs = await repos.messages.get_messages(session["id"], limit=200)
        for m in msgs:
            role = m.get("role", "")
            if role not in ("user", "assistant") or m.get("tool_calls"):
                continue
            content = (m.get("content") or "").strip()
            if not content:
                continue
            messages.append({
                "role": role,
                "content": content,
                "timestamp": m.get("timestamp", m.get("created_at", "")),
                "session_key": s["session_key"],
            })

    messages.sort(key=lambda m: m.get("timestamp", ""))
    return messages[-limit:]


# -- Client session endpoints -------------------------------------------------


@router.get("/{client_id}/sessions")
async def list_client_sessions(request: Request, client_id: str):
    client = await _get_owned_client(request, client_id)
    repos = request.app.state.repos
    all_sessions = await repos.sessions.list_sessions(client["owner_id"])
    prefix = f"client:{client_id}:"
    result = []
    for s in all_sessions:
        if s.get("session_key", "").startswith(prefix):
            result.append({
                "session_key": s["session_key"],
                "message_count": s.get("message_count", 0),
                "updated_at": s.get("updated_at", ""),
            })
    return result


@router.get("/{client_id}/sessions/{session_key:path}/messages")
async def get_client_session_messages(
    request: Request, client_id: str, session_key: str,
):
    client = await _get_owned_client(request, client_id)
    repos = request.app.state.repos
    if not session_key.startswith(f"client:{client_id}:"):
        raise HTTPException(404, "Session not found for this client")
    session = await repos.sessions.get(client["owner_id"], session_key)
    if not session:
        return []
    msgs = await repos.messages.get_messages(session["id"], limit=200)
    result = []
    for m in msgs:
        role = m.get("role", "")
        if role in ("user", "assistant") and not m.get("tool_calls"):
            content = (m.get("content") or "").strip()
            if content:
                result.append({"role": role, "content": content})
    return result


@router.delete("/{client_id}/sessions/{session_key:path}")
async def delete_client_session(
    request: Request, client_id: str, session_key: str,
):
    client = await _get_owned_client(request, client_id)
    if not session_key.startswith(f"client:{client_id}:"):
        raise HTTPException(404, "Session not found for this client")
    ok = await request.app.state.repos.sessions.delete(
        client["owner_id"], session_key,
    )
    return {"ok": ok}
