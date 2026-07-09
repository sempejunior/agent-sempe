"""nanobot web server — FastAPI backend for the chat interface."""

from __future__ import annotations

import asyncio
import html as htmllib
import json
import secrets as pysecrets
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from starlette.websockets import WebSocketState

_STATIC_DIR = Path(__file__).parent / "frontend" / "static"

_WEB_CHAT_TIMEOUT_S = 180

# Umbrella families that group the finer template categories in the catalog UI.
_TEMPLATE_GROUPS = {
    "Comportamental": "Gestão de Pessoas",
    "T&D": "Gestão de Pessoas",
    "R&S": "Gestão de Pessoas",
    "Engajamento": "Gestão de Pessoas",
    "Ponto": "Operações & Compliance",
    "DP": "Operações & Compliance",
    "Jurídico": "Operações & Compliance",
    "Sistema": "Sistema",
}


def _template_group(category: str) -> str:
    return _TEMPLATE_GROUPS.get(category or "", "Geral")


# Skills a template recommends and pre-selects — including built-in skills (montar-pdi,
# criar-paginas, relatorio-time-azure) that the template drives via read_skill but that
# are not stored as the template's own skill rows. Template config, keyed by template id.
_TEMPLATE_RECOMMENDED_SKILLS = {
    "pdi_desenvolvimento": [
        "montar-pdi", "criar-paginas", "relatorio-time-azure", "analise-desempenho",
        "pdi_por_perfil", "feedback_estruturado",
    ],
    "profiler_consultor": ["interpretar_perfil_profiler", "plano_gestao_por_perfil"],
    "rs_recrutador": ["fit_comportamental_profiler", "triagem_curriculo"],
    "clima_engajamento": ["analise_pesquisa_clima", "plano_acao_engajamento"],
    "ponto_assistente": ["regras_ponto_portaria_671", "calculo_banco_horas"],
    "dp_analista": ["folha_pagamento_basico", "admissao_rescisao_checklist"],
    "juridico_trabalhista": ["analise_risco_trabalhista", "redacao_juridica_formal"],
}


def _template_recommended_skills(template_id: str) -> list[str]:
    return list(_TEMPLATE_RECOMMENDED_SKILLS.get(template_id, []))


async def _ensure_db(app_state: Any, data_dir: Path) -> bool:
    """Check DB health; reconnect if the connection died.

    Returns True when repos are usable, False otherwise.
    """
    if not hasattr(app_state, "db") or app_state.db is None:
        return hasattr(app_state, "repos") and app_state.repos is not None

    try:
        await app_state.db.execute("SELECT 1")
        return True
    except Exception:
        pass

    logger.warning("SQLite connection lost — reconnecting…")
    try:
        from nanobot.db.factory import create_sqlite_factory
        from nanobot.db.sqlite.connection import create_database

        db_path = data_dir / "nanobot.db"
        db = await create_database(db_path)
        repos = create_sqlite_factory(db)
        app_state.db = db
        app_state.repos = repos
        logger.info("SQLite connection restored")
        return True
    except Exception as exc:
        logger.error("Failed to reconnect SQLite: {}", exc)
        return False


def create_app(*, config: Any, provider: Any, data_dir: Path) -> FastAPI:
    """Factory: build the FastAPI application."""

    app = FastAPI(title="nanobot", docs_url=None, redoc_url=None)


    @app.on_event("startup")
    async def startup():
        from nanobot.utils.crypto import ensure_master_key

        ensure_master_key(data_dir)

        if hasattr(app.state, "agent"):
            logger.info("Using injected dependencies for web server")
            return

        from nanobot.bus.queue import MessageBus
        from nanobot.client.loop import ClientAwareAgentLoop
        from nanobot.cron.service import CronService
        from nanobot.db.factory import create_sqlite_factory
        from nanobot.db.sqlite.connection import create_database

        db_path = data_dir / "nanobot.db"
        db = await create_database(db_path)
        repos = create_sqlite_factory(db)
        bus = MessageBus()
        cron = CronService(cron_repo=repos.cron)

        agent = ClientAwareAgentLoop(
            bus=bus,
            provider=provider,
            workspace=config.workspace_path,
            model=config.agents.defaults.model,
            temperature=config.agents.defaults.temperature,
            max_tokens=config.agents.defaults.max_tokens,
            max_iterations=config.agents.defaults.max_tool_iterations,
            memory_window=config.agents.defaults.memory_window,
            brave_api_key=config.tools.web.search.api_key or None,
            exec_config=config.tools.exec,
            cron_service=cron,
            restrict_to_workspace=config.tools.restrict_to_workspace,
            mcp_servers=config.tools.mcp_servers,
            channels_config=config.channels,
            repos=repos,
            public_url=config.gateway.public_url or None,
        )

        async def on_cron_job(job):
            channel = job.payload.channel or "system"
            to = job.payload.to or f"web:{job.user_id}"
            return await agent.process_direct(
                job.payload.message,
                session_key=f"cron:{job.id}",
                channel="system",
                chat_id=f"{channel}:{to}",
                user_id=job.user_id,
                agent_id=job.agent_id or None,
            )

        cron.on_job = on_cron_job

        await cron.start()

        app.state.db = db
        app.state.repos = repos
        app.state.agent = agent
        app.state.cron = cron
        app.state.bus = bus
        logger.info("Web server started — DB at {}", db_path)

    @app.on_event("shutdown")
    async def shutdown():
        if hasattr(app.state, "cron"):
            app.state.cron.stop()
        if hasattr(app.state, "agent"):
            await app.state.agent.close_mcp()
        if hasattr(app.state, "db") and app.state.db is not None:
            try:
                await app.state.db.close()
            except Exception:
                pass

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        logger.error(
            "Unhandled error on {} {}:\n{}", request.method, request.url.path, tb,
        )
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    def _get_user_id(request: Request) -> str:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        raise HTTPException(401, "Missing or invalid Authorization header")

    async def _require_user(request: Request) -> dict[str, Any]:
        uid = _get_user_id(request)
        try:
            user = await app.state.repos.users.get_by_id(uid)
        except (ValueError, RuntimeError):
            if await _ensure_db(app.state, data_dir):
                user = await app.state.repos.users.get_by_id(uid)
            else:
                raise HTTPException(503, "Database unavailable")
        if not user:
            raise HTTPException(401, "User not found")
        return user

    def _public_agent(agent: dict[str, Any]) -> dict[str, Any]:
        return {
            "agent_id": agent["agent_id"],
            "name": agent.get("name", ""),
            "role": agent.get("role", ""),
            "description": agent.get("description", ""),
            "avatar": agent.get("avatar", ""),
            "is_default": bool(agent.get("is_default")),
            "status": agent.get("status", "active"),
            "metadata": agent.get("metadata", {}),
            "agent_config": agent.get("agent_config", {}),
            "bootstrap": agent.get("bootstrap", {}),
            "tools_enabled": agent.get("tools_enabled", []),
            "channel_configs": agent.get("channel_configs", {}),
            "created_at": agent.get("created_at", ""),
            "updated_at": agent.get("updated_at", ""),
        }

    async def _ensure_default_agent(user: dict[str, Any]) -> dict[str, Any]:
        agent = await app.state.repos.agents.get_default_agent(user["user_id"])
        if agent:
            return agent
        agent_id = await app.state.repos.agents.create_agent(user["user_id"], {
            "agent_id": f"{user['user_id']}:default",
            "name": "Paulo",
            "role": "Especialista em DP",
            "description": "Agente padrão conectado ao backend atual.",
            "avatar": "P",
            "is_default": True,
            "agent_config": user.get("agent_config", {}),
            "bootstrap": user.get("bootstrap", {}),
            "tools_enabled": user.get("tools_enabled", []),
            "channel_configs": user.get("channel_configs", {}),
            "metadata": {"source": "compat_default"},
        })
        agent = await app.state.repos.agents.get_agent(user["user_id"], agent_id)
        if not agent:
            raise HTTPException(500, "Failed to create default agent")
        return agent

    async def _require_agent(request: Request, agent_id: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
        user = await _require_user(request)
        agent_id = agent_id or request.headers.get("x-agent-id") or request.query_params.get("agent_id")
        if agent_id:
            agent = await app.state.repos.agents.get_agent(user["user_id"], agent_id)
            if not agent or agent.get("status") == "deleted":
                raise HTTPException(404, "Agent not found")
        else:
            agent = await _ensure_default_agent(user)
        return user, agent

    def _invalidate_agent_context(user_id: str, agent_id: str | None = None) -> None:
        if not hasattr(app.state, "agent") or not hasattr(app.state.agent, "_user_contexts"):
            return
        if agent_id is None:
            for key in list(app.state.agent._user_contexts):
                if key.startswith(f"{user_id}:"):
                    app.state.agent._user_contexts.pop(key, None)
            return
        if agent_id:
            app.state.agent._user_contexts.pop(f"{user_id}:{agent_id}", None)
        app.state.agent._user_contexts.pop(f"{user_id}:default", None)

    def _mask_secret(value: str) -> str:
        if not value:
            return ""
        return f"{'•' * min(8, max(0, len(value) - 4))}{value[-4:]}" if len(value) > 4 else "••••"

    def _is_masked_secret(value: str) -> bool:
        return "*" in value or "•" in value

    def _is_unresolved_secret_ref(value: str) -> bool:
        return value.strip().lower() in {"@vault", "vault", "@secret", "@secrets"}

    def _provider_from_server_defaults(model: str) -> dict[str, Any]:
        provider_name = config.get_provider_name(model) if model else ""
        provider_cfg = config.get_provider(model) if model else None
        if not provider_name or not provider_cfg:
            return {"name": "", "api_key": "", "api_base": ""}
        return {
            "name": provider_name,
            "api_key": provider_cfg.api_key or "",
            "api_base": provider_cfg.api_base or "",
        }

    def _merge_provider_config(user_provider: dict[str, Any], server_provider: dict[str, Any]) -> dict[str, Any]:
        merged = dict(server_provider)
        for key, value in (user_provider or {}).items():
            if value not in (None, ""):
                merged[key] = value
        if user_provider.get("name"):
            merged["name"] = user_provider["name"]
        if "api_base" in user_provider:
            merged["api_base"] = user_provider.get("api_base") or ""
        return merged

    async def _resolve_provider_config(user_id: str, provider_cfg: dict[str, Any]) -> dict[str, Any]:
        provider_cfg = dict(provider_cfg or {})
        provider_name = provider_cfg.get("name", "")
        key = provider_cfg.get("api_key", "")
        if provider_name and (not key or (isinstance(key, str) and _is_unresolved_secret_ref(key))):
            from nanobot.secrets import get_credential_secret

            secret = await get_credential_secret(
                getattr(app.state, "db", None),
                data_dir,
                user_id,
                "provider",
                provider_name,
            )
            if secret:
                provider_cfg["api_key"] = secret
        return provider_cfg

    async def _resolve_channel_config_secrets(
        user_id: str,
        channel_name: str,
        cfg_dict: dict[str, Any],
        secret_keys: set[str],
    ) -> dict[str, Any]:
        from nanobot.secrets import resolve_channel_secret

        resolved = dict(cfg_dict or {})
        for key in secret_keys:
            value = resolved.get(key)
            if isinstance(value, str) and _is_unresolved_secret_ref(value):
                secret = await resolve_channel_secret(
                    getattr(app.state, "db", None),
                    data_dir,
                    user_id,
                    channel_name,
                    key,
                )
                if secret:
                    resolved[key] = secret
        return resolved

    @app.post("/api/auth/register")
    async def register(request: Request):
        body = await request.json()
        uid = body.get("user_id", "").strip()
        if not uid:
            raise HTTPException(400, "user_id is required")

        repos = app.state.repos
        if await repos.users.get_by_id(uid):
            raise HTTPException(409, "User already exists")

        await repos.users.create({
            "user_id": uid,
            "display_name": body.get("display_name", uid),
            "email": body.get("email"),
            "agent_config": {
                "model": config.agents.defaults.model,
                "max_tokens": config.agents.defaults.max_tokens,
                "temperature": config.agents.defaults.temperature,
                "max_tool_iterations": config.agents.defaults.max_tool_iterations,
                "memory_window": config.agents.defaults.memory_window,
            },
        })
        user = await repos.users.get_by_id(uid)
        agent = await _ensure_default_agent(user)
        await repos.channel_bindings.bind(uid, "web", uid, agent["agent_id"])

        user = await repos.users.get_by_id(uid)
        return {"token": uid, "user": _safe_user(user)}

    @app.post("/api/auth/login")
    async def login(request: Request):
        body = await request.json()
        uid = body.get("user_id", "").strip()
        if not uid:
            raise HTTPException(400, "user_id is required")

        user = await app.state.repos.users.get_by_id(uid)
        if not user:
            raise HTTPException(404, "User not found")

        return {"token": uid, "user": _safe_user(user)}

    @app.get("/api/me")
    async def get_me(request: Request):
        user = await _require_user(request)
        return _safe_user(user)

    @app.get("/api/agents")
    async def list_agents(request: Request):
        user = await _require_user(request)
        await _ensure_default_agent(user)
        agents = await app.state.repos.agents.list_agents(user["user_id"])
        return [_public_agent(a) for a in agents]

    @app.get("/api/agents/templates")
    async def list_agent_templates(request: Request):
        await _require_user(request)
        rows = await app.state.repos.agent_templates.list_templates()
        for r in rows:
            r["group"] = _template_group(r.get("category", ""))
            r["recommended_skills"] = _template_recommended_skills(r.get("id", ""))
        return rows

    @app.get("/api/agents/templates/{template_id}")
    async def get_agent_template(request: Request, template_id: str):
        await _require_user(request)
        tpl = await app.state.repos.agent_templates.get_template(template_id)
        if not tpl:
            raise HTTPException(status_code=404, detail="Template não encontrado")
        skills = await app.state.repos.agent_templates.list_skills(template_id)
        knowledge = await app.state.repos.agent_templates.list_knowledge(template_id)
        tpl["skills"] = [
            {
                "name": s["name"],
                "description": s["description"],
                "always_active": s["always_active"],
            }
            for s in skills
        ]
        tpl["knowledge_sources"] = [{"source": k["source"]} for k in knowledge]
        tpl["group"] = _template_group(tpl.get("category", ""))
        tpl["recommended_skills"] = _template_recommended_skills(template_id)
        return tpl

    @app.post("/api/agents")
    async def create_agent(request: Request):
        user = await _require_user(request)
        body = await request.json()

        name = (body.get("name") or "").strip()
        role = (body.get("role") or "").strip()
        description = (body.get("description") or "").strip()
        missing = [f for f, v in [("name", name), ("role", role), ("description", description)] if not v]
        if missing:
            raise HTTPException(status_code=422, detail=f"Campos obrigatórios ausentes: {', '.join(missing)}")

        base = await _ensure_default_agent(user)

        raw_metadata = body.get("metadata")
        metadata: dict[str, Any] = dict(raw_metadata) if isinstance(raw_metadata, dict) else {}
        template_id = (
            metadata.get("template")
            or body.get("template")
            or "custom"
        )
        metadata.setdefault("template", template_id)

        tpl_skill_names: list[str] = []
        tpl: dict[str, Any] | None = None
        if template_id and template_id not in ("custom", "blank"):
            tpl = await app.state.repos.agent_templates.get_template(template_id)
            if tpl:
                tpl_skills = await app.state.repos.agent_templates.list_skills(template_id)
                for skill in tpl_skills:
                    await app.state.repos.skills.save_skill(user["user_id"], {
                        "name": skill["name"],
                        "content": skill["content"],
                        "description": skill.get("description", ""),
                        "always_active": skill.get("always_active", False),
                        "enabled": True,
                        "origin": "solides",
                    })
                    tpl_skill_names.append(skill["name"])
                if tpl.get("rag_enabled"):
                    tpl_knowledge = await app.state.repos.agent_templates.list_knowledge(template_id)
                    for doc in tpl_knowledge:
                        await app.state.repos.retriever.ingest(
                            user["user_id"],
                            doc["content"],
                            metadata={
                                "source": doc["source"],
                                "template": template_id,
                            },
                        )

        agent_config: dict[str, Any] = {
            **(user.get("agent_config", {}) or {}),
            **(base.get("agent_config", {}) or {}),
            **(body.get("agent_config", {}) or {}),
        }
        if tpl:
            existing_skills = list(agent_config.get("skills_enabled") or [])
            recommended = _template_recommended_skills(template_id)
            merged_skills = list(dict.fromkeys([*existing_skills, *tpl_skill_names, *recommended]))
            agent_config["skills_enabled"] = merged_skills
            if tpl.get("rag_enabled"):
                rag_cfg = dict(agent_config.get("rag", {}) or {})
                rag_cfg["enabled"] = True
                agent_config["rag"] = rag_cfg
            if tpl.get("model_recommended") and not agent_config.get("model"):
                agent_config["model"] = tpl["model_recommended"]

        bootstrap = body.get("bootstrap") or {}
        if tpl and not bootstrap.get("AGENTS.md"):
            tpl_sections = []
            if tpl.get("system_prompt"):
                tpl_sections.append(tpl["system_prompt"])
            if tpl.get("guardrails"):
                tpl_sections.append(f"## Guardrails\n{tpl['guardrails']}")
            if tpl_sections:
                bootstrap = {**bootstrap, "AGENTS.md": "\n\n".join(tpl_sections)}

        tools_enabled = body.get("tools_enabled")
        if tools_enabled is None:
            tools_enabled = tpl.get("tools") if tpl else base.get("tools_enabled", [])

        avatar = body.get("avatar")
        if not avatar:
            avatar = (tpl.get("icon") if tpl else None) or name[:1].upper()

        agent_id = await app.state.repos.agents.create_agent(user["user_id"], {
            "name": name,
            "role": role,
            "description": description,
            "avatar": avatar,
            "agent_config": agent_config,
            "bootstrap": bootstrap,
            "tools_enabled": tools_enabled,
            "channel_configs": body.get("channel_configs", {}),
            "metadata": metadata,
            "status": body.get("status", "active"),
        })
        agent = await app.state.repos.agents.get_agent(user["user_id"], agent_id)
        return _public_agent(agent)

    @app.post("/api/agents/{agent_id}/duplicate")
    async def duplicate_agent(request: Request, agent_id: str):
        user, _agent = await _require_agent(request, agent_id)
        new_id = await app.state.repos.agents.duplicate_agent(user["user_id"], agent_id)
        if not new_id:
            raise HTTPException(status_code=404, detail="Agente não encontrado")
        agent = await app.state.repos.agents.get_agent(user["user_id"], new_id)
        return _public_agent(agent)

    @app.get("/api/agents/{agent_id}/metrics")
    async def get_agent_metrics(request: Request, agent_id: str):
        user, _agent = await _require_agent(request, agent_id)
        return await app.state.repos.agents.get_agent_metrics(user["user_id"], agent_id)

    @app.get("/api/agents/{agent_id}")
    async def get_agent(request: Request, agent_id: str):
        _, agent = await _require_agent(request, agent_id)
        return _public_agent(agent)

    @app.patch("/api/agents/{agent_id}")
    async def update_agent(request: Request, agent_id: str):
        user, current_agent = await _require_agent(request, agent_id)
        body = await request.json()
        allowed = {
            "name", "role", "description", "avatar", "is_default",
            "agent_config", "bootstrap", "tools_enabled", "channel_configs",
            "metadata", "status",
        }
        fields = {k: v for k, v in body.items() if k in allowed}
        if "agent_config" in fields and isinstance(fields["agent_config"], dict):
            merged_cfg = dict(current_agent.get("agent_config", {}) or {})
            incoming = fields["agent_config"]
            for key, value in incoming.items():
                if key == "rag" and isinstance(value, dict):
                    existing_rag = dict(merged_cfg.get("rag", {}) or {})
                    existing_rag.update(value)
                    merged_cfg["rag"] = existing_rag
                else:
                    merged_cfg[key] = value
            fields["agent_config"] = merged_cfg
        ok = await app.state.repos.agents.update_agent(user["user_id"], agent_id, fields)
        _invalidate_agent_context(user["user_id"], agent_id)
        agent = await app.state.repos.agents.get_agent(user["user_id"], agent_id)
        return {"ok": ok, "agent": _public_agent(agent)}

    @app.get("/api/agents/{agent_id}/selection")
    async def get_agent_selection(request: Request, agent_id: str):
        _user, agent = await _require_agent(request, agent_id)
        agent_cfg = agent.get("agent_config", {}) or {}
        channel_cfgs = agent.get("channel_configs", {}) or {}
        return {
            "tools_enabled": agent.get("tools_enabled", []),
            "skills_enabled": agent_cfg.get("skills_enabled"),
            "mcp_servers_enabled": agent_cfg.get("mcp_servers_enabled"),
            "channels_enabled": [
                name for name, cfg in channel_cfgs.items()
                if isinstance(cfg, dict) and cfg.get("enabled")
            ],
            "rag_enabled": bool((agent_cfg.get("rag") or {}).get("enabled")),
        }

    @app.delete("/api/agents/{agent_id}")
    async def delete_agent(request: Request, agent_id: str):
        user, _agent = await _require_agent(request, agent_id)
        ok = await app.state.repos.agents.delete_agent(user["user_id"], agent_id)
        _invalidate_agent_context(user["user_id"], agent_id)
        return {"ok": ok}

    def _embed_public_url(request: Request, token: str) -> str:
        base = str(request.base_url).rstrip("/")
        return f"{base}/embed/{token}"

    def _embed_snippet(url: str, agent_name: str) -> str:
        safe_name = htmllib.escape(agent_name or "Agente")
        return (
            f'<iframe src="{url}" title="{safe_name}" '
            'style="width:100%;max-width:420px;height:600px;border:0;'
            'border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12);" '
            'allow="clipboard-write"></iframe>'
        )

    def _embed_state(request: Request, agent: dict[str, Any]) -> dict[str, Any]:
        meta = agent.get("metadata") or {}
        enabled = bool(meta.get("embed_enabled"))
        token = meta.get("embed_token") or ""
        if not enabled or not token:
            return {"enabled": False, "token": "", "url": "", "snippet": ""}
        url = _embed_public_url(request, token)
        return {
            "enabled": True,
            "token": token,
            "url": url,
            "snippet": _embed_snippet(url, agent.get("name", "")),
        }

    @app.get("/api/agents/{agent_id}/embed")
    async def get_embed_config(request: Request, agent_id: str):
        _user, agent = await _require_agent(request, agent_id)
        return _embed_state(request, agent)

    @app.post("/api/agents/{agent_id}/embed")
    async def enable_embed(request: Request, agent_id: str):
        user, agent = await _require_agent(request, agent_id)
        meta = dict(agent.get("metadata") or {})
        token = meta.get("embed_token") or pysecrets.token_urlsafe(24)
        meta["embed_enabled"] = True
        meta["embed_token"] = token
        await app.state.repos.agents.update_agent(
            user["user_id"], agent_id, {"metadata": meta},
        )
        agent = await app.state.repos.agents.get_agent(user["user_id"], agent_id)
        return _embed_state(request, agent)

    @app.delete("/api/agents/{agent_id}/embed")
    async def disable_embed(request: Request, agent_id: str):
        user, agent = await _require_agent(request, agent_id)
        meta = dict(agent.get("metadata") or {})
        meta["embed_enabled"] = False
        await app.state.repos.agents.update_agent(
            user["user_id"], agent_id, {"metadata": meta},
        )
        return {"enabled": False, "token": "", "url": "", "snippet": ""}

    async def _resolve_embed(token: str) -> tuple[dict[str, Any], dict[str, Any]]:
        agent = await app.state.repos.agents.find_by_embed_token(token)
        if not agent:
            raise HTTPException(404, "Embed not found or disabled")
        owner = await app.state.repos.users.get_by_id(agent["user_id"])
        if not owner:
            raise HTTPException(404, "Embed owner not found")
        return owner, agent

    @app.get("/embed/{token}")
    async def embed_page(token: str):
        try:
            _owner, agent = await _resolve_embed(token)
        except HTTPException:
            return JSONResponse({"error": "not_found"}, status_code=404)
        name = htmllib.escape(agent.get("name", "Agente"))
        role = htmllib.escape(agent.get("role", ""))
        avatar = htmllib.escape((agent.get("avatar") or name[:1] or "A").upper())
        safe_token = htmllib.escape(token)
        html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{name}</title>
<style>
:root {{ color-scheme: light; }}
*,*::before,*::after {{ box-sizing: border-box; }}
body {{ margin:0; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f5f5f7; color:#111; height:100vh; display:flex; flex-direction:column; }}
header {{ padding:14px 16px; background:#fff; border-bottom:1px solid #eee;
         display:flex; align-items:center; gap:12px; }}
.avatar {{ width:36px; height:36px; border-radius:50%; background:#7c3aed;
          color:#fff; display:flex; align-items:center; justify-content:center;
          font-weight:700; }}
.name {{ font-weight:700; font-size:14px; }}
.role {{ font-size:12px; color:#666; }}
#log {{ flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }}
.msg {{ max-width:85%; padding:10px 14px; border-radius:16px; font-size:14px;
       line-height:1.45; white-space:pre-wrap; word-wrap:break-word; }}
.user {{ align-self:flex-end; background:#7c3aed; color:#fff; border-bottom-right-radius:4px; }}
.bot {{ align-self:flex-start; background:#fff; color:#111; border:1px solid #eee;
       border-bottom-left-radius:4px; }}
.typing {{ color:#888; font-style:italic; }}
form {{ display:flex; gap:8px; padding:12px; background:#fff; border-top:1px solid #eee; }}
input {{ flex:1; padding:10px 14px; border:1px solid #ddd; border-radius:20px;
        font-size:14px; outline:none; }}
input:focus {{ border-color:#7c3aed; }}
button {{ padding:10px 18px; background:#7c3aed; color:#fff; border:0;
         border-radius:20px; font-weight:600; cursor:pointer; }}
button:disabled {{ opacity:.5; cursor:not-allowed; }}
</style></head><body>
<header>
  <div class="avatar">{avatar}</div>
  <div><div class="name">{name}</div><div class="role">{role}</div></div>
</header>
<div id="log"></div>
<form id="f"><input id="i" placeholder="Digite sua mensagem…" autocomplete="off" required/>
<button id="s" type="submit">Enviar</button></form>
<script>
const TOKEN = "{safe_token}";
const KEY = "nanobot_embed_session_" + TOKEN;
let sessionKey = localStorage.getItem(KEY);
if (!sessionKey) {{
  sessionKey = "embed:" + Math.random().toString(36).slice(2,14);
  localStorage.setItem(KEY, sessionKey);
}}
const log = document.getElementById("log");
const form = document.getElementById("f");
const input = document.getElementById("i");
const send = document.getElementById("s");
function add(text, cls) {{
  const d = document.createElement("div");
  d.className = "msg " + cls; d.textContent = text; log.appendChild(d);
  log.scrollTop = log.scrollHeight; return d;
}}
form.addEventListener("submit", async (e) => {{
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  add(text, "user"); input.value = "";
  send.disabled = true;
  const typing = add("digitando…", "bot typing");
  try {{
    const r = await fetch("/embed/" + TOKEN + "/message", {{
      method:"POST", headers:{{"Content-Type":"application/json"}},
      body: JSON.stringify({{ content: text, session_key: sessionKey }}),
    }});
    const data = await r.json();
    typing.remove();
    if (data.error) add("Erro: " + data.error, "bot");
    else add(data.reply || "(sem resposta)", "bot");
  }} catch (err) {{
    typing.remove(); add("Falha de conexão.", "bot");
  }} finally {{ send.disabled = false; input.focus(); }}
}});
</script></body></html>"""
        return HTMLResponse(html)

    @app.post("/embed/{token}/message")
    async def embed_message(token: str, request: Request):
        try:
            owner, agent = await _resolve_embed(token)
        except HTTPException as exc:
            return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

        try:
            payload = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid_json"}, status_code=400)

        content = (payload.get("content") or "").strip()
        if not content:
            return JSONResponse({"error": "empty_message"}, status_code=400)

        raw_key = (payload.get("session_key") or "").strip()
        if not raw_key:
            raw_key = f"embed:{uuid.uuid4().hex[:12]}"
        session_key = f"embed:{token}:{raw_key}"

        try:
            reply = await app.state.agent.process_direct(
                content,
                session_key=session_key,
                channel="embed",
                chat_id=session_key,
                user_id=owner["user_id"],
                agent_id=agent["agent_id"],
            )
        except ValueError as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        except Exception as e:
            logger.exception("Embed message error for token {}", token)
            return JSONResponse({"error": f"internal: {e}"}, status_code=500)

        return {"reply": reply or "", "session_key": raw_key}

    @app.get("/api/sessions")
    async def list_sessions(request: Request):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        repos = app.state.repos
        sessions = await repos.sessions.list_sessions(uid, agent_id=agent["agent_id"])
        result = []
        key_prefix = f"agent:{agent['agent_id']}:"
        for s in sessions:
            session_key = s["session_key"]
            if isinstance(session_key, str) and session_key.startswith(key_prefix):
                session_key = session_key[len(key_prefix):]
            title = "New Chat"
            try:
                msgs = await repos.messages.get_messages(s["id"], limit=1)
                if msgs:
                    content = msgs[0].get("content", "")
                    title = content[:60] + ("..." if len(content) > 60 else "")
            except Exception:
                pass
            result.append({
                "session_key": session_key,
                "title": title,
                "message_count": s.get("message_count", 0),
                "updated_at": s.get("updated_at", ""),
            })
        return result

    @app.get("/api/sessions/{session_key:path}/messages")
    async def get_messages(request: Request, session_key: str):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        repos = app.state.repos
        db_session_key = f"agent:{agent['agent_id']}:{session_key}"
        session = await repos.sessions.get(uid, db_session_key, agent["agent_id"])
        if not session:
            session = await repos.sessions.get(uid, session_key, agent["agent_id"])
        if not session:
            return []
        msgs = await repos.messages.get_messages(session["id"], limit=200)
        result = []
        for m in msgs:
            role = m.get("role", "")
            if role == "user":
                result.append({"role": "user", "content": m.get("content", "")})
            elif role == "assistant" and not m.get("tool_calls"):
                content = (m.get("content") or "").strip()
                if content:
                    result.append({"role": "assistant", "content": content})
        return result

    @app.delete("/api/sessions/{session_key:path}")
    async def delete_session(request: Request, session_key: str):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        db_session_key = f"agent:{agent['agent_id']}:{session_key}"
        ok = await app.state.repos.sessions.delete(uid, db_session_key, agent["agent_id"])
        if not ok:
            ok = await app.state.repos.sessions.delete(uid, session_key, agent["agent_id"])
        return {"ok": ok}

    @app.get("/api/cron")
    async def list_cron(request: Request):
        from nanobot.cron.service import compute_next_runs
        user, agent = await _require_agent(request)
        jobs = await app.state.cron.list_jobs(
            user_id=user["user_id"], include_disabled=True, agent_id=agent["agent_id"],
        )
        return [
            {
                "id": j.id, "name": j.name, "enabled": j.enabled,
                "schedule_kind": j.schedule.kind,
                "schedule_expr": j.schedule.expr or (
                    f"every {(j.schedule.every_ms or 0) // 1000}s"
                    if j.schedule.kind == "every" else ""
                ),
                "message": j.payload.message,
                "deliver": j.payload.deliver,
                "channel": j.payload.channel,
                "to": j.payload.to,
                "tz": j.schedule.tz,
                "next_runs": compute_next_runs(j.schedule, count=3) if j.enabled else [],
                "last_run_at_ms": j.state.last_run_at_ms,
                "last_status": j.state.last_status,
                "last_error": j.state.last_error,
            }
            for j in jobs
        ]

    @app.post("/api/cron/preview")
    async def preview_cron(request: Request):
        """Given a schedule, return the next N run timestamps. Does not persist anything."""
        from nanobot.cron.service import compute_next_runs
        from nanobot.cron.types import CronSchedule
        body = await request.json()
        kind = body.get("kind", "every")
        count = min(int(body.get("count", 5)), 20)
        if kind == "every":
            sched = CronSchedule(kind="every", every_ms=int(body.get("every_seconds", 3600)) * 1000)
        elif kind == "cron":
            sched = CronSchedule(kind="cron", expr=body.get("expr", ""), tz=body.get("tz"))
        elif kind == "at":
            sched = CronSchedule(kind="at", at_ms=int(body.get("at_ms", 0)))
        else:
            raise HTTPException(400, "Invalid schedule kind")
        try:
            runs = compute_next_runs(sched, count=count)
        except Exception as e:
            raise HTTPException(400, f"Invalid schedule: {e}") from e
        return {"next_runs": runs}

    @app.post("/api/cron")
    async def add_cron(request: Request):
        user, agent = await _require_agent(request)
        body = await request.json()
        from nanobot.cron.types import CronSchedule

        kind = body.get("kind", "every")
        if kind == "every":
            sched = CronSchedule(kind="every", every_ms=int(body.get("every_seconds", 3600)) * 1000)
        elif kind == "cron":
            sched = CronSchedule(kind="cron", expr=body.get("expr", "0 9 * * *"), tz=body.get("tz"))
        elif kind == "at":
            sched = CronSchedule(kind="at", at_ms=int(body.get("at_ms", 0)))
        else:
            raise HTTPException(400, "Invalid schedule kind")

        job = await app.state.cron.add_job(
            name=body.get("name", "Web job"),
            schedule=sched,
            message=body.get("message", ""),
            deliver=bool(body.get("deliver", False)),
            channel=body.get("channel"),
            to=body.get("to"),
            delete_after_run=bool(body.get("delete_after_run", kind == "at")),
            user_id=user["user_id"],
            agent_id=agent["agent_id"],
        )
        return {"id": job.id, "name": job.name}

    @app.delete("/api/cron/{job_id}")
    async def delete_cron(request: Request, job_id: str):
        user, agent = await _require_agent(request)
        ok = await app.state.cron.remove_job(job_id, user_id=user["user_id"], agent_id=agent["agent_id"])
        return {"ok": ok}

    @app.put("/api/cron/{job_id}/enable")
    async def enable_cron(request: Request, job_id: str):
        user, agent = await _require_agent(request)
        body = await request.json()
        enabled = bool(body.get("enabled", True))
        job = await app.state.cron.enable_job(
            job_id, enabled=enabled, user_id=user["user_id"], agent_id=agent["agent_id"],
        )
        if not job:
            raise HTTPException(404, "Job not found")
        return {"ok": True, "enabled": enabled}

    @app.post("/api/cron/{job_id}/run")
    async def run_cron(request: Request, job_id: str):
        user, agent = await _require_agent(request)
        ok = await app.state.cron.run_job(
            job_id, force=True, user_id=user["user_id"], agent_id=agent["agent_id"],
        )
        if not ok:
            raise HTTPException(404, "Job not found or could not be run")
        return {"ok": True}

    @app.get("/api/config")
    async def get_config(request: Request):
        user, agent = await _require_agent(request)
        return {
            **(user.get("agent_config", {}) or {}),
            **(agent.get("agent_config", {}) or {}),
        }

    @app.put("/api/config")
    async def update_config(request: Request):
        user, agent = await _require_agent(request)
        body = await request.json()
        global_keys = {
            "model", "max_tokens", "temperature", "max_tool_iterations",
            "memory_window", "language", "custom_instructions",
        }
        user_cfg = user.get("agent_config", {}) or {}
        agent_cfg = agent.get("agent_config", {}) or {}
        for key, value in body.items():
            if key in global_keys:
                user_cfg[key] = value
                agent_cfg.pop(key, None)
            else:
                agent_cfg[key] = value
        await app.state.repos.users.update(user["user_id"], {"agent_config": user_cfg})
        await app.state.repos.agents.update_agent(user["user_id"], agent["agent_id"], {"agent_config": agent_cfg})
        _invalidate_agent_context(user["user_id"])
        return {"ok": True, "agent_config": {**user_cfg, **agent_cfg}}

    @app.get("/api/config/provider")
    async def get_provider_config(request: Request):
        user, agent = await _require_agent(request)
        user_cfg = user.get("agent_config", {}) or {}
        agent_cfg = agent.get("agent_config", {}) or {}
        model = user_cfg.get("model") or agent_cfg.get("model") or config.agents.defaults.model
        server_provider = _provider_from_server_defaults(model)
        provider = await _resolve_provider_config(
            user["user_id"],
            _merge_provider_config(user_cfg.get("provider") or {}, server_provider),
        )
        masked = dict(provider)
        key = masked.get("api_key", "")
        if key:
            masked["api_key"] = _mask_secret(key)
        return masked

    @app.put("/api/config/provider")
    async def update_provider_config(request: Request):
        user, agent = await _require_agent(request)
        body = await request.json()
        user_cfg = user.get("agent_config", {}) or {}
        current = user_cfg.get("provider", {}) or {}
        model = user_cfg.get("model") or agent.get("agent_config", {}).get("model") or config.agents.defaults.model
        effective_current = await _resolve_provider_config(
            user["user_id"],
            _merge_provider_config(current, _provider_from_server_defaults(model)),
        )
        new_key = body.get("api_key", "")
        if isinstance(new_key, str) and _is_masked_secret(new_key):
            body["api_key"] = effective_current.get("api_key", "")
        elif isinstance(new_key, str) and _is_unresolved_secret_ref(new_key):
            raise HTTPException(400, "API key placeholder is not supported. Paste the real key.")
        user_cfg["provider"] = {
            "name": body.get("name", ""),
            "api_key": body.get("api_key", ""),
            "api_base": body.get("api_base", ""),
        }
        await app.state.repos.users.update(user["user_id"], {"agent_config": user_cfg})
        _invalidate_agent_context(user["user_id"])
        return {"ok": True}

    def _normalize_mcp_servers(raw: Any) -> list[dict[str, Any]]:
        if isinstance(raw, dict):
            normalized: list[dict[str, Any]] = []
            for name, cfg in raw.items():
                if not isinstance(cfg, dict):
                    continue
                normalized.append({"name": name, **{k: v for k, v in cfg.items() if k != "name"}})
            return normalized
        if isinstance(raw, list):
            return [entry for entry in raw if isinstance(entry, dict) and entry.get("name")]
        return []

    def _mask_mcp_servers(servers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        masked: list[dict[str, Any]] = []
        for entry in servers:
            copy = dict(entry)
            for key in ("auth_token", "auth_password"):
                value = copy.get(key)
                if isinstance(value, str) and value:
                    copy[key] = _mask_secret(value)
            masked.append(copy)
        return masked

    @app.get("/api/config/mcp")
    async def get_mcp_config(request: Request):
        user = await _require_user(request)
        user_cfg = user.get("agent_config", {}) or {}
        servers = _normalize_mcp_servers(user_cfg.get("mcp_servers"))
        return {"mcpServers": _mask_mcp_servers(servers)}

    @app.put("/api/config/mcp")
    async def update_mcp_config(request: Request):
        from nanobot.config.schema import MCPServerConfig

        user = await _require_user(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(422, "Invalid JSON body")

        if not isinstance(body, dict) or "mcpServers" not in body:
            raise HTTPException(422, "Body must be an object with a 'mcpServers' field")

        raw_servers = body["mcpServers"]
        if not isinstance(raw_servers, list):
            raise HTTPException(
                422, "mcpServers must be a list of {name, ...config} entries"
            )

        user_cfg = user.get("agent_config", {}) or {}
        current_servers = _normalize_mcp_servers(user_cfg.get("mcp_servers"))
        current_by_name = {entry["name"]: entry for entry in current_servers}

        new_servers: list[dict[str, Any]] = []
        seen_names: set[str] = set()
        for idx, entry in enumerate(raw_servers):
            if not isinstance(entry, dict):
                raise HTTPException(422, f"mcpServers[{idx}] must be an object")
            name = entry.get("name")
            if not isinstance(name, str) or not name.strip():
                raise HTTPException(422, f"mcpServers[{idx}].name is required")
            name = name.strip()
            if name in seen_names:
                raise HTTPException(422, f"Duplicate MCP server name: {name}")
            seen_names.add(name)

            merged = {k: v for k, v in entry.items() if k != "name"}
            previous = current_by_name.get(name, {})
            for secret_key in ("auth_token", "auth_password"):
                incoming = merged.get(secret_key)
                if isinstance(incoming, str) and _is_masked_secret(incoming):
                    merged[secret_key] = previous.get(secret_key, "")
                elif isinstance(incoming, str) and _is_unresolved_secret_ref(incoming):
                    raise HTTPException(
                        400,
                        f"MCP server '{name}' credential placeholder is not supported. Paste the real secret.",
                    )
            try:
                MCPServerConfig.model_validate(merged)
            except Exception as exc:
                raise HTTPException(422, f"Invalid config for MCP server '{name}': {exc}")
            new_servers.append({"name": name, **merged})

        user_cfg["mcp_servers"] = new_servers
        await app.state.repos.users.update(user["user_id"], {"agent_config": user_cfg})
        _invalidate_agent_context(user["user_id"])

        try:
            parsed = {
                entry["name"]: MCPServerConfig.model_validate(
                    {k: v for k, v in entry.items() if k != "name"}
                )
                for entry in new_servers
            }
            await app.state.agent.reload_mcp(parsed)
        except Exception as e:
            logger.warning("MCP reload failed (config saved anyway): {}", e)

        return {"ok": True}

    @app.get("/api/skills/builtin")
    async def get_builtin_skills():
        from nanobot.agent.skills import SkillsLoader
        loader = SkillsLoader(workspace=config.workspace_path)
        all_skills = loader._list_skills_fs(filter_unavailable=False)
        result = []
        seen: set[str] = set()
        for s in all_skills:
            if s.get("source") != "builtin":
                continue
            meta_raw = await loader.get_skill_metadata(s["name"]) or {}
            nanobot_meta = loader._parse_nanobot_metadata(meta_raw.get("metadata", ""))
            content = await loader.load_skill(s["name"]) or ""
            # This endpoint has no per-user context, so availability here reflects only
            # host requirements (bins/env). Integration-gating is user-specific and is
            # computed on the client from `required_integrations` + the active integrations.
            _meta_no_integ = {**nanobot_meta,
                              "requires": {k: v for k, v in nanobot_meta.get("requires", {}).items()
                                           if k != "integrations"}}
            result.append({
                "name": s["name"],
                "description": meta_raw.get("description", s["name"]),
                "available": loader._check_requirements(_meta_no_integ),
                "always": nanobot_meta.get("always", False) or meta_raw.get("always") == "true",
                "content": content,
                "category": nanobot_meta.get("category", "sistema"),
                "importance": nanobot_meta.get("importance", "core"),
                "provides": nanobot_meta.get("provides", ""),
                "required_integrations": nanobot_meta.get("requires", {}).get("integrations", []),
            })
            seen.add(s["name"])

        templates = await app.state.repos.agent_templates.list_templates()
        for tpl in templates:
            tpl_skills = await app.state.repos.agent_templates.list_skills(tpl["id"])
            for skill in tpl_skills:
                if skill["name"] in seen:
                    continue
                seen.add(skill["name"])
                result.append({
                    "name": skill["name"],
                    "description": skill.get("description", ""),
                    "available": True,
                    "always": bool(skill.get("always_active", False)),
                    "content": skill["content"],
                    "category": tpl.get("category", "Sólides"),
                    "importance": "core",
                    "provides": "",
                    "required_integrations": [],
                    "template_id": tpl["id"],
                })
        return result

    @app.get("/api/skills")
    async def get_skills(request: Request):
        _user, agent = await _require_agent(request)
        return {"tools_enabled": agent.get("tools_enabled", [])}

    @app.put("/api/skills")
    async def update_skills(request: Request):
        user, agent = await _require_agent(request)
        body = await request.json()
        tools = body.get("tools_enabled", [])
        await app.state.repos.agents.update_agent(user["user_id"], agent["agent_id"], {"tools_enabled": tools})
        _invalidate_agent_context(user["user_id"], agent["agent_id"])
        return {"ok": True, "tools_enabled": tools}

    @app.get("/api/skills/custom")
    async def get_custom_skills(request: Request):
        user = await _require_user(request)
        skills = await app.state.repos.skills.list_skills(
            user["user_id"], enabled_only=False,
        )
        return skills

    @app.delete("/api/skills/custom/{name}")
    async def delete_custom_skill(request: Request, name: str):
        user = await _require_user(request)
        ok = await app.state.repos.skills.delete_skill(user["user_id"], name)
        _invalidate_agent_context(user["user_id"])
        return {"ok": ok}

    @app.put("/api/skills/custom/{name}")
    async def update_custom_skill(request: Request, name: str):
        user = await _require_user(request)
        body = await request.json()
        skill = await app.state.repos.skills.get_skill(user["user_id"], name)
        if not skill:
            skill = {"name": name, "content": "", "description": "", "enabled": 1, "always_active": 0}
        skill["content"] = body.get("content", skill["content"])
        skill["description"] = body.get("description", skill.get("description", ""))
        skill["always_active"] = body.get("always_active", skill.get("always_active", 0))
        skill["enabled"] = body.get("enabled", skill.get("enabled", 1))
        await app.state.repos.skills.save_skill(user["user_id"], skill)
        _invalidate_agent_context(user["user_id"])
        return {"ok": True}

    @app.get("/api/memory")
    async def get_memory(request: Request):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        repos = app.state.repos

        long_term = await repos.memories.get_long_term(uid, agent["agent_id"])
        history = await repos.memories.get_history(uid, agent_id=agent["agent_id"])

        return {
            "long_term": long_term,
            "history": history
        }

    @app.get("/api/memory/search")
    async def search_memory(request: Request, q: str = ""):
        user, agent = await _require_agent(request)
        if not q.strip():
            return {"results": []}
        results = await app.state.repos.memories.search_history(
            user["user_id"], q.strip(), agent_id=agent["agent_id"],
        )
        return {"results": results}

    @app.delete("/api/memory")
    async def clear_memory(request: Request):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        count = await app.state.repos.memories.clear_history(uid, agent["agent_id"])
        return {"ok": True, "deleted": count}

    @app.delete("/api/memory/{entry_id}")
    async def delete_memory(request: Request, entry_id: int):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        ok = await app.state.repos.memories.delete_history(uid, entry_id, agent["agent_id"])
        return {"ok": ok}

    @app.put("/api/memory/long_term")
    async def update_long_term_memory(request: Request):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        body = await request.json()
        content = body.get("content", "")
        await app.state.repos.memories.save_long_term(uid, content, agent["agent_id"])
        return {"ok": True}

    @app.get("/api/config/rag")
    async def get_rag_config(request: Request):
        user = await _require_user(request)
        user_cfg = user.get("agent_config", {}) or {}
        rag = dict(user_cfg.get("rag", {"enabled": False, "default_backend": "local", "backends": {}}))
        backends = dict(rag.get("backends", {}))
        for name, b in backends.items():
            b = dict(b)
            if b.get("api_key"):
                key = b["api_key"]
                b["api_key"] = f"{'*' * max(0, len(key) - 4)}{key[-4:]}" if len(key) > 4 else "****"
            backends[name] = b
        rag["backends"] = backends
        return rag

    @app.put("/api/config/rag")
    async def update_rag_config(request: Request):
        user = await _require_user(request)
        body = await request.json()
        user_cfg = user.get("agent_config", {}) or {}
        current_rag = user_cfg.get("rag", {}) or {}
        current_backends = current_rag.get("backends", {})
        new_backends = body.get("backends", {})
        for name, b in new_backends.items():
            if "*" in b.get("api_key", ""):
                old = current_backends.get(name, {})
                b["api_key"] = old.get("api_key", "")
        body["backends"] = new_backends
        user_cfg["rag"] = body
        await app.state.repos.users.update(user["user_id"], {"agent_config": user_cfg})
        _invalidate_agent_context(user["user_id"])
        return {"ok": True}

    @app.get("/api/config/websearch")
    async def get_websearch_config(request: Request):
        user = await _require_user(request)
        user_cfg = user.get("agent_config", {}) or {}
        ws = dict(user_cfg.get("web_search", {}) or {})
        key = ws.get("api_key", "")
        if key:
            ws["api_key"] = f"{'*' * max(0, len(key) - 4)}{key[-4:]}" if len(key) > 4 else "****"
        ws.setdefault("provider", "brave")
        ws.setdefault("max_results", 5)
        return ws

    @app.put("/api/config/websearch")
    async def update_websearch_config(request: Request):
        user = await _require_user(request)
        body = await request.json()
        user_cfg = user.get("agent_config", {}) or {}
        current = user_cfg.get("web_search", {}) or {}
        new_key = body.get("api_key", "")
        if "*" in new_key:
            new_key = current.get("api_key", "")
        user_cfg["web_search"] = {
            "provider": body.get("provider", "brave"),
            "api_key": new_key,
            "max_results": int(body.get("max_results", 5) or 5),
        }
        await app.state.repos.users.update(user["user_id"], {"agent_config": user_cfg})
        _invalidate_agent_context(user["user_id"])
        return {"ok": True}

    def _serialize_catalog_entry(entry: Any) -> dict[str, Any]:
        base: dict[str, Any] = {
            "id": entry.id,
            "kind": entry.kind,
            "name": entry.name,
            "description": entry.description,
            "category": entry.category,
            "docs_url": entry.docs_url,
            "setup_steps": list(entry.setup_steps),
            "credential_fields": [
                {
                    "key": f.key,
                    "label": f.label,
                    "kind": f.kind,
                    "required": f.required,
                    "hint": f.hint,
                }
                for f in entry.credential_fields
            ],
            "auth_mode": entry.auth.mode,
        }
        if entry.api:
            base["api"] = {
                "base_url": entry.api.base_url,
                "endpoints": [
                    {
                        "key": e.key,
                        "method": e.method,
                        "path": e.path,
                        "description": e.description,
                        "query_params": list(e.query_params),
                        "body_params": list(e.body_params),
                    }
                    for e in entry.api.endpoints
                ],
            }
        if entry.mcp:
            base["mcp"] = {
                "command": entry.mcp.command,
                "args": list(entry.mcp.args),
                "url": entry.mcp.url,
                "env_from_credential": dict(entry.mcp.env_from_credential),
            }
        return base

    def _public_credential(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "provider_key": row.get("provider_key", ""),
            "metadata": row.get("metadata", {}),
            "created_at": row.get("created_at", ""),
            "updated_at": row.get("updated_at", ""),
        }

    def _public_integration(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "slug": row["slug"],
            "kind": row["kind"],
            "system_integration_id": row.get("system_integration_id"),
            "label": row.get("label", ""),
            "enabled": bool(row.get("enabled")),
            "credential_id": row.get("credential_id"),
            "config": row.get("config", {}),
            "created_at": row.get("created_at", ""),
            "updated_at": row.get("updated_at", ""),
        }

    @app.get("/api/integrations/catalog")
    async def get_integrations_catalog(request: Request):
        await _require_user(request)
        from nanobot.integrations.catalog import CATALOG
        return [_serialize_catalog_entry(e) for e in CATALOG]

    @app.get("/api/integrations")
    async def list_user_integrations(request: Request):
        user = await _require_user(request)
        rows = await app.state.repos.integrations.list_integrations(user["user_id"])
        return [_public_integration(r) for r in rows]

    @app.put("/api/integrations/{slug}")
    async def upsert_user_integration(request: Request, slug: str):
        from nanobot.integrations.catalog import get_integration as get_catalog_entry
        user = await _require_user(request)
        body = await request.json()
        kind = body.get("kind")
        system_id = body.get("system_integration_id")
        credential_id = body.get("credential_id")

        if system_id:
            entry = get_catalog_entry(system_id)
            if not entry:
                raise HTTPException(400, f"Unknown system integration '{system_id}'")
            kind = entry.kind
            if entry.credential_fields and not credential_id:
                raise HTTPException(
                    400,
                    f"Integration '{system_id}' requires a credential.",
                )

        if credential_id:
            cred = await app.state.repos.credentials.get_credential(user["user_id"], credential_id)
            if not cred:
                raise HTTPException(404, "Credential not found")

        integration_id = await app.state.repos.integrations.upsert({
            "user_id": user["user_id"],
            "slug": slug,
            "kind": kind or "api",
            "system_integration_id": system_id,
            "label": body.get("label", ""),
            "enabled": bool(body.get("enabled", True)),
            "credential_id": credential_id,
            "config": body.get("config", {}),
        })
        row = await app.state.repos.integrations.get_by_id(user["user_id"], integration_id)
        _invalidate_agent_context(user["user_id"])
        return _public_integration(row) if row else {"ok": True}

    @app.delete("/api/integrations/{slug}")
    async def delete_user_integration(request: Request, slug: str):
        user = await _require_user(request)
        ok = await app.state.repos.integrations.delete(user["user_id"], slug)
        _invalidate_agent_context(user["user_id"])
        return {"ok": ok}

    @app.get("/api/credentials")
    async def list_credentials(request: Request):
        user = await _require_user(request)
        rows = await app.state.repos.credentials.list_credentials(user["user_id"])
        return [_public_credential(r) for r in rows]

    @app.post("/api/credentials")
    async def create_credential(request: Request):
        from nanobot.utils.crypto import encrypt
        user = await _require_user(request)
        body = await request.json()
        name = str(body.get("name", "")).strip()
        if not name:
            raise HTTPException(400, "name is required")
        secret = body.get("secret", {})
        if not isinstance(secret, dict):
            raise HTTPException(400, "secret must be an object of key/value pairs")
        cipher = encrypt(json.dumps(secret))
        credential_id = await app.state.repos.credentials.create({
            "user_id": user["user_id"],
            "name": name,
            "provider_key": body.get("provider_key", ""),
            "secret_cipher": cipher,
            "metadata": body.get("metadata", {}),
        })
        row = await app.state.repos.credentials.get_credential(user["user_id"], credential_id)
        return _public_credential(row) if row else {"id": credential_id}

    @app.put("/api/credentials/{credential_id}")
    async def update_credential(request: Request, credential_id: int):
        from nanobot.utils.crypto import encrypt
        user = await _require_user(request)
        body = await request.json()
        current = await app.state.repos.credentials.get_credential(user["user_id"], credential_id)
        if not current:
            raise HTTPException(404, "Credential not found")
        fields: dict[str, Any] = {}
        if "name" in body:
            fields["name"] = str(body["name"]).strip()
        if "provider_key" in body:
            fields["provider_key"] = body["provider_key"]
        if "metadata" in body:
            fields["metadata"] = body["metadata"]
        if "secret" in body and isinstance(body["secret"], dict):
            fields["secret_cipher"] = encrypt(json.dumps(body["secret"]))
        await app.state.repos.credentials.update(user["user_id"], credential_id, fields)
        row = await app.state.repos.credentials.get_credential(user["user_id"], credential_id)
        _invalidate_agent_context(user["user_id"])
        return _public_credential(row) if row else {"ok": True}

    @app.delete("/api/credentials/{credential_id}")
    async def delete_credential(request: Request, credential_id: int):
        user = await _require_user(request)
        ok = await app.state.repos.credentials.delete(user["user_id"], credential_id)
        _invalidate_agent_context(user["user_id"])
        return {"ok": ok}

    @app.get("/api/config/prompts")
    async def get_prompts(request: Request):
        user = await _require_user(request)
        from nanobot.prompts import PROMPT_FILES, PROMPT_ORDER, load_base_prompt

        user_extensions = user.get("bootstrap", {}) or {}
        result = []
        for filename in PROMPT_ORDER:
            meta = PROMPT_FILES[filename]
            result.append({
                "filename": filename,
                "label": meta["label"],
                "description": meta["description"],
                "hint": meta["hint"],
                "base": load_base_prompt(filename),
                "extension": user_extensions.get(filename, ""),
            })
        return result

    @app.put("/api/config/prompts")
    async def update_prompts(request: Request):
        user = await _require_user(request)
        body = await request.json()
        from nanobot.prompts import PROMPT_FILES

        extensions = dict(user.get("bootstrap", {}) or {})
        for item in body:
            filename = item.get("filename", "")
            if filename in PROMPT_FILES:
                ext = item.get("extension", "")
                if ext.strip():
                    extensions[filename] = ext
                elif filename in extensions:
                    del extensions[filename]

        await app.state.repos.users.update(user["user_id"], {"bootstrap": extensions})
        _invalidate_agent_context(user["user_id"])
        return {"ok": True}

    def _get_user_channel_configs(user: dict) -> dict:
        return user.get("channel_configs", {}) or {}

    def _get_agent_channel_configs(agent: dict) -> dict:
        return agent.get("channel_configs", {}) or {}

    @app.get("/api/channels")
    async def list_channels(request: Request):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        from nanobot.channels.registry import CHANNEL_META, CHANNEL_ORDER, mask_channel_config

        user_cfgs = _get_user_channel_configs(user)
        agent_cfgs = _get_agent_channel_configs(agent)
        channels_mgr = getattr(app.state, "channels", None)
        user_status = channels_mgr.get_user_channel_status(uid, agent["agent_id"]) if channels_mgr else {}

        result = []
        for name in CHANNEL_ORDER:
            meta = CHANNEL_META.get(name, {})
            raw_cfg_dict = user_cfgs.get(name, {})
            agent_channel_cfg = agent_cfgs.get(name, {})
            enabled = bool(agent_channel_cfg.get("enabled", False))
            status = user_status.get(name, {})
            running = status.get("running", False)
            last_error = status.get("last_error")
            required_fields = [
                f["key"] for f in meta.get("fields", [])
                if f.get("required") and f.get("key") != "enabled"
            ]
            secret_keys = {f["key"] for f in meta.get("fields", []) if f.get("type") == "password"}
            cfg_dict = await _resolve_channel_config_secrets(uid, name, raw_cfg_dict, secret_keys)
            config_complete = all(
                bool(cfg_dict.get(key))
                and not (
                    key in secret_keys
                    and isinstance(cfg_dict.get(key), str)
                    and _is_unresolved_secret_ref(cfg_dict[key])
                )
                for key in required_fields
            )
            masked_config = mask_channel_config(name, cfg_dict)
            for key in secret_keys:
                if isinstance(cfg_dict.get(key), str) and _is_unresolved_secret_ref(cfg_dict[key]):
                    masked_config[key] = ""

            result.append({
                "name": name,
                "label": meta.get("label", name),
                "description": meta.get("description", ""),
                "docs_url": meta.get("docs_url"),
                "setup_steps": meta.get("setup_steps", []),
                "fields": meta.get("fields", []),
                "enabled": enabled,
                "running": running,
                "last_error": last_error,
                "config_complete": config_complete,
                "config": {**masked_config, "enabled": enabled},
            })
        return result

    @app.put("/api/channels/{channel_name}")
    async def update_channel(request: Request, channel_name: str):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        from nanobot.channels.registry import CHANNEL_META

        if channel_name not in CHANNEL_META:
            raise HTTPException(404, f"Unknown channel: {channel_name}")

        body = await request.json()
        meta = CHANNEL_META[channel_name]
        secret_keys = {f["key"] for f in meta.get("fields", []) if f.get("type") == "password"}

        all_user_cfgs = _get_user_channel_configs(user)
        current = dict(all_user_cfgs.get(channel_name, {}))

        for key, value in body.items():
            if key == "enabled":
                continue
            if key in secret_keys and isinstance(value, str) and _is_masked_secret(value):
                continue
            if key in secret_keys and isinstance(value, str) and _is_unresolved_secret_ref(value):
                raise HTTPException(400, f"{meta.get('label', channel_name)} credential placeholder is not supported. Paste the real secret.")
            current[key] = value

        all_user_cfgs[channel_name] = current
        await app.state.repos.users.update(uid, {"channel_configs": all_user_cfgs})

        if "enabled" in body:
            await _set_agent_channel_enabled(
                uid, agent, channel_name, bool(body["enabled"]),
            )

        channels_mgr = getattr(app.state, "channels", None)
        owner_key = channels_mgr._owner_key(uid, agent["agent_id"]) if channels_mgr else uid
        existing = channels_mgr.user_channels.get(owner_key, {}).get(channel_name) if channels_mgr else None
        if existing:
            existing._last_error = None
        return {"ok": True}

    def _classify_channel_error(exc: BaseException, channel: str) -> tuple[int, dict[str, Any]]:
        from nanobot.channels.registry import CHANNEL_META

        label = CHANNEL_META.get(channel, {}).get("label", channel)
        exc_type = type(exc).__name__.lower()
        raw_msg = str(exc)
        lower = raw_msg.lower()
        auth_signals = ("invalidtoken", "unauthorized", "invalid token", "token was rejected", "401", "authentication")
        if any(sig in exc_type for sig in ("invalidtoken", "unauthorized", "forbidden")) or any(
            sig in lower for sig in auth_signals
        ):
            return 400, {
                "error": "invalid_credential",
                "channel": channel,
                "message": f"{label} rejeitou a credencial. Verifique se o token/senha está correto.",
                "detail_code": "AUTH_INVALID_CREDENTIAL",
            }
        if any(sig in exc_type for sig in ("timeout", "connection")) or any(
            sig in lower for sig in ("timeout", "connection refused", "unreachable", "network")
        ):
            return 503, {
                "error": "channel_unreachable",
                "channel": channel,
                "message": f"Não foi possível conectar em {label}. Tente novamente em instantes.",
                "detail_code": "CHANNEL_UNREACHABLE",
            }
        return 400, {
            "error": "channel_start_failed",
            "channel": channel,
            "message": f"Falha ao iniciar {label}. Confira a configuração.",
            "detail_code": "CHANNEL_START_FAILED",
        }

    async def _set_agent_channel_enabled(
        uid: str, agent: dict[str, Any], channel_name: str, enabled: bool,
    ) -> None:
        all_agent_cfgs = dict(_get_agent_channel_configs(agent))
        entry = dict(all_agent_cfgs.get(channel_name, {}))
        if enabled:
            entry["enabled"] = True
            all_agent_cfgs[channel_name] = entry
        else:
            all_agent_cfgs.pop(channel_name, None)
        await app.state.repos.agents.update_agent(
            uid, agent["agent_id"], {"channel_configs": all_agent_cfgs},
        )

    @app.post("/api/channels/{channel_name}/start")
    async def start_channel(request: Request, channel_name: str):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        from nanobot.channels.registry import CHANNEL_META
        from nanobot.config.schema import ChannelsConfig

        if channel_name not in CHANNEL_META:
            raise HTTPException(404, f"Unknown channel: {channel_name}")

        channels_mgr = getattr(app.state, "channels", None)
        if not channels_mgr:
            raise HTTPException(503, "Channel manager not available")

        user_cfgs = _get_user_channel_configs(user)
        ch_cfg_dict = dict(user_cfgs.get(channel_name, {}))
        meta = CHANNEL_META[channel_name]
        required_fields = [
            f["key"] for f in meta.get("fields", [])
            if f.get("required") and f.get("key") != "enabled"
        ]
        missing = [k for k in required_fields if not ch_cfg_dict.get(k)]
        if missing:
            raise HTTPException(
                400, f"Channel {channel_name} is missing required fields: {', '.join(missing)}",
            )
        ch_cfg_dict["enabled"] = True
        secret_keys = {
            f["key"] for f in meta.get("fields", []) if f.get("type") == "password"
        }
        ch_cfg_dict = await _resolve_channel_config_secrets(uid, channel_name, ch_cfg_dict, secret_keys)
        bad_refs = [
            key for key in secret_keys
            if isinstance(ch_cfg_dict.get(key), str) and _is_unresolved_secret_ref(ch_cfg_dict[key])
        ]
        if bad_refs:
            raise HTTPException(
                400,
                f"Channel {channel_name} has unresolved credential placeholder(s): {', '.join(bad_refs)}. Paste the real secret.",
            )

        owner_key = channels_mgr._owner_key(uid, agent["agent_id"])
        user_chs = channels_mgr.user_channels.get(owner_key, {})
        existing = user_chs.get(channel_name)
        if existing and getattr(existing, "is_running", False):
            await _set_agent_channel_enabled(uid, agent, channel_name, True)
            return {"ok": True, "message": "Already running"}

        try:
            channels_cfg_obj = getattr(ChannelsConfig(), channel_name)
            cfg_cls = channels_cfg_obj.__class__
            cfg = cfg_cls.model_validate(ch_cfg_dict)
        except Exception as e:
            raise HTTPException(400, f"Invalid config for {channel_name}: {e}")

        try:
            channels_mgr.create_user_channel(uid, channel_name, cfg, agent_id=agent["agent_id"])
            task = await channels_mgr.start_user_channel(uid, channel_name, agent_id=agent["agent_id"])
            await asyncio.wait({task}, timeout=3)
            current = channels_mgr.user_channels.get(owner_key, {}).get(channel_name)
            last_error = getattr(current, "_last_error", None) if current else None
            if last_error:
                raise RuntimeError(last_error)
            if task.done():
                task.result()
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Channel start failed ({} for {}): {}", channel_name, uid, e)
            await _set_agent_channel_enabled(uid, agent, channel_name, False)
            status_code, detail = _classify_channel_error(e, channel_name)
            raise HTTPException(status_code, detail)

        await app.state.repos.channel_bindings.bind(uid, channel_name, uid, agent["agent_id"])
        await _set_agent_channel_enabled(uid, agent, channel_name, True)
        return {"ok": True, "message": f"{channel_name} starting"}

    @app.post("/api/channels/{channel_name}/stop")
    async def stop_channel(request: Request, channel_name: str):
        user, agent = await _require_agent(request)
        uid = user["user_id"]
        from nanobot.channels.registry import CHANNEL_META

        if channel_name not in CHANNEL_META:
            raise HTTPException(404, f"Unknown channel: {channel_name}")

        channels_mgr = getattr(app.state, "channels", None)
        if not channels_mgr:
            raise HTTPException(503, "Channel manager not available")

        await channels_mgr.stop_user_channel(uid, channel_name, agent_id=agent["agent_id"])
        await _set_agent_channel_enabled(uid, agent, channel_name, False)
        return {"ok": True, "message": f"{channel_name} stopped"}

    from nanobot.web.routes.clients import router as clients_router
    app.include_router(clients_router)

    ws_clients: dict[str, list[WebSocket]] = {}
    ws_tasks: set[asyncio.Task] = set()

    @app.websocket("/ws/chat")
    async def ws_chat(ws: WebSocket):
        await ws.accept()
        token = ws.query_params.get("token", "")
        if not token:
            await ws.send_json({"type": "error", "content": "No token"})
            await ws.close()
            return

        try:
            user = await app.state.repos.users.get_by_id(token)
        except (ValueError, RuntimeError):
            if await _ensure_db(app.state, data_dir):
                user = await app.state.repos.users.get_by_id(token)
            else:
                await ws.send_json({"type": "error", "content": "Database unavailable"})
                await ws.close()
                return
        if not user:
            await ws.send_json({"type": "error", "content": "Invalid token"})
            await ws.close()
            return

        uid = user["user_id"]
        logger.info("WebSocket connected: {}", uid)
        ws_clients.setdefault(uid, []).append(ws)

        async def _deliver(payload: dict) -> bool:
            """Send to this socket, falling back to the user's newest live socket.

            The web client auto-reconnects: a long agent turn can outlive the
            socket that submitted it, so the response is rerouted instead of lost.
            """
            candidates = [ws] + [s for s in reversed(ws_clients.get(uid, [])) if s is not ws]
            for sock in candidates:
                if (sock.client_state != WebSocketState.CONNECTED
                        or sock.application_state != WebSocketState.CONNECTED):
                    continue
                try:
                    await sock.send_json(payload)
                    return True
                except Exception:
                    continue
            return False

        async def on_progress(text: str, *, tool_hint: bool = False) -> None:
            await _deliver({
                "type": "tool_hint" if tool_hint else "progress",
                "content": text,
            })

        async def _handle_message(content: str, session_key: str, agent_id: str | None) -> None:
            """Run one agent turn and deliver the outcome.

            Runs as a background task so the receive loop keeps consuming
            frames during long turns — otherwise uvicorn pauses reading
            (backpressure), keepalive pongs stop being read and the socket
            is killed mid-turn.
            """
            error_payload: dict[str, Any] | None = None
            response: str | None = None
            try:
                response = await asyncio.wait_for(
                    app.state.agent.process_direct(
                        content,
                        session_key=session_key,
                        channel="web",
                        chat_id=uid,
                        on_progress=on_progress,
                        user_id=uid,
                        agent_id=agent_id,
                    ),
                    timeout=_WEB_CHAT_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                logger.warning("Chat timed out for {} after {}s", uid, _WEB_CHAT_TIMEOUT_S)
                error_payload = {
                    "type": "error",
                    "code": "timeout",
                    "content": (
                        "A tarefa demorou demais e foi interrompida. "
                        "Tente novamente ou reformule o pedido."
                    ),
                    "session_key": session_key,
                }
            except ValueError as e:
                msg = str(e)
                logger.warning("Chat validation error for {}: {}", uid, msg)
                low = msg.lower()
                if "agent not found" in low or "no agent available" in low:
                    code = "agent_not_found"
                    message = "Agente não encontrado ou sem acesso."
                elif "user not found" in low:
                    code = "user_not_found"
                    message = "Usuário não encontrado."
                else:
                    code = "invalid_request"
                    message = msg
                error_payload = {
                    "type": "error",
                    "code": code,
                    "content": message,
                    "session_key": session_key,
                }
            except Exception as e:
                logger.exception("Chat error for {}", uid)
                error_payload = {
                    "type": "error",
                    "code": "internal_error",
                    "content": f"Erro interno: {e}",
                    "session_key": session_key,
                }

            payload = error_payload if error_payload is not None else {
                "type": "response",
                "content": response,
                "session_key": session_key,
            }
            if not await _deliver(payload):
                logger.warning("WS closed before response for {}", uid)

        try:
            while True:
                data = await ws.receive_json()
                msg_type = data.get("type", "")

                if msg_type == "message":
                    content = data.get("content", "").strip()
                    session_key = data.get("session_key", f"web:{uuid.uuid4().hex[:12]}")
                    agent_id = data.get("agent_id")

                    if not content:
                        continue

                    task = asyncio.create_task(
                        _handle_message(content, session_key, agent_id)
                    )
                    ws_tasks.add(task)
                    task.add_done_callback(ws_tasks.discard)

                elif msg_type == "ping":
                    try:
                        await ws.send_json({"type": "pong"})
                    except Exception:
                        break

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected: {}", uid)
        except RuntimeError as e:
            logger.info("WebSocket closed mid-send for {}: {}", uid, e)
        except Exception as e:
            logger.exception("WebSocket error for {}: {}", token, e)
        finally:
            socks = ws_clients.get(uid)
            if socks and ws in socks:
                socks.remove(ws)
                if not socks:
                    ws_clients.pop(uid, None)

    @app.get("/r/{token}")
    async def serve_report(token: str):
        """Serve a generated report page by its secret token (capability URL).

        No auth: the unguessable token is the access control. Served with a
        script-blocking CSP so LLM/user-authored HTML cannot run scripts against
        the app's origin.
        """
        import re

        if not re.fullmatch(r"[0-9a-fA-F]{8,64}", token):
            raise HTTPException(404, "Not found")
        reports_dir = (config.workspace_path / "reports").resolve()
        path = (reports_dir / f"{token}.html").resolve()
        if not path.is_relative_to(reports_dir) or not path.is_file():
            raise HTTPException(404, "Not found")
        return FileResponse(
            path,
            media_type="text/html",
            headers={
                "Content-Security-Policy": (
                    "default-src 'none'; style-src 'unsafe-inline'; "
                    "img-src data:; font-src data:; base-uri 'none'"
                ),
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )

    @app.get("/")
    async def root():
        return FileResponse(_STATIC_DIR / "index.html")

    @app.get("/favicon.ico")
    async def favicon():
        return JSONResponse(content={}, status_code=204)

    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    return app


def _safe_user(u: dict[str, Any]) -> dict[str, Any]:
    """Strip sensitive fields from user dict."""
    return {
        "user_id": u["user_id"],
        "display_name": u.get("display_name", ""),
        "email": u.get("email"),
        "status": u.get("status", "active"),
    }
