"""Tools for managing MCP server configuration."""

from __future__ import annotations

from typing import Any

from nanobot.agent.tools.base import Tool
from nanobot.config.schema import MCPServerConfig


class SaveMCPServerTool(Tool):
    """Save or update an MCP server for the current user."""

    def __init__(
        self,
        *,
        user_id: str | None,
        user_repo: Any | None,
    ):
        self.user_id = user_id
        self.user_repo = user_repo

    @property
    def name(self) -> str:
        return "save_mcp_server"

    @property
    def description(self) -> str:
        return (
            "Save or update an MCP server configuration for this user. Use it after "
            "the user provides the server name and either an HTTP URL or a stdio "
            "command/args. Do not invent credentials."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "server_name": {
                    "type": "string",
                    "description": "Short MCP server key, e.g. 'finance_api' or 'totvs_rm'.",
                    "minLength": 1,
                    "maxLength": 64,
                },
                "url": {
                    "type": "string",
                    "description": "HTTP/SSE MCP endpoint URL. Leave empty for stdio servers.",
                },
                "command": {
                    "type": "string",
                    "description": "Stdio command. Leave empty for HTTP/SSE servers.",
                },
                "args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Command arguments for stdio MCP servers.",
                },
                "env": {
                    "type": "object",
                    "description": "Environment variables for stdio MCP servers.",
                },
                "headers": {
                    "type": "object",
                    "description": "HTTP headers for HTTP/SSE MCP servers.",
                },
                "auth_type": {
                    "type": "string",
                    "enum": ["none", "bearer", "api_key", "basic"],
                    "description": "Authentication mode.",
                },
                "auth_token": {
                    "type": "string",
                    "description": "Bearer/API token if needed.",
                },
                "auth_username": {
                    "type": "string",
                    "description": "Basic auth username if needed.",
                },
                "auth_password": {
                    "type": "string",
                    "description": "Basic auth password if needed.",
                },
                "auth_header_name": {
                    "type": "string",
                    "description": "Header name for api_key auth. Defaults to Authorization.",
                },
                "tool_timeout": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 300,
                    "description": "Tool call timeout in seconds.",
                },
            },
            "required": ["server_name"],
        }

    async def execute(self, **kwargs: Any) -> str:
        if not self.user_id or not self.user_repo:
            return "Error: MCP configuration storage is not available."

        server_name = str(kwargs.get("server_name", "")).strip()
        if not server_name:
            return "Error: server_name is required."

        payload = {
            "url": kwargs.get("url", "") or "",
            "command": kwargs.get("command", "") or "",
            "args": kwargs.get("args") or [],
            "env": kwargs.get("env") or {},
            "headers": kwargs.get("headers") or {},
            "auth_type": kwargs.get("auth_type") or "none",
            "auth_token": kwargs.get("auth_token") or "",
            "auth_username": kwargs.get("auth_username") or "",
            "auth_password": kwargs.get("auth_password") or "",
            "auth_header_name": kwargs.get("auth_header_name") or "Authorization",
            "tool_timeout": kwargs.get("tool_timeout") or 30,
        }
        if not payload["url"] and not payload["command"]:
            return "Error: provide either url or command for the MCP server."

        cfg = MCPServerConfig.model_validate(payload).model_dump(by_alias=False)
        user = await self.user_repo.get_by_id(self.user_id)
        if not user:
            return f"Error: user '{self.user_id}' not found."

        agent_config = dict(user.get("agent_config") or {})
        servers = list(agent_config.get("mcp_servers") or [])
        replaced = False
        for entry in servers:
            if isinstance(entry, dict) and entry.get("name") == server_name:
                entry.update(cfg)
                entry["name"] = server_name
                replaced = True
                break
        if not replaced:
            servers.append({"name": server_name, **cfg})
        agent_config["mcp_servers"] = servers
        await self.user_repo.update(self.user_id, {"agent_config": agent_config})
        return f"MCP server '{server_name}' saved. It will be available after MCP reload or next context refresh."
