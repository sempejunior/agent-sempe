"""Build MCP server configs from a user's enabled catalog integrations.

Turns each enabled ``kind="mcp"`` user integration into an ``MCPServerConfig``,
resolving the catalog entry and decrypting the linked credential into env vars
(via the entry's ``env`` templates and ``env_from_credential`` map). The agent
loop connects the resulting servers per user and exposes ``mcp_<slug>_*`` tools.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from nanobot.config.schema import MCPServerConfig
    from nanobot.db.factory import RepositoryFactory


def _resolve_env(mcp, credential: dict) -> dict[str, str]:
    """Resolve the server's env from templated values + flat credential fields."""
    env: dict[str, str] = {}
    for key, template in (mcp.env or {}).items():
        try:
            env[key] = template.format(**credential)
        except (KeyError, IndexError):
            env[key] = template
    for env_key, field in (mcp.env_from_credential or {}).items():
        if field in credential:
            env[env_key] = str(credential[field])
    return env


async def build_user_mcp_servers(
    user_id: str, repos: "RepositoryFactory"
) -> tuple[dict[str, "MCPServerConfig"], str]:
    """Return ({slug: MCPServerConfig}, signature) for the user's enabled MCP integrations.

    The signature changes when the set of servers or their credentials change, so
    callers can cache connections and only reconnect when it differs.
    """
    from nanobot.config.schema import MCPServerConfig
    from nanobot.integrations.catalog import get_integration
    from nanobot.utils.crypto import decrypt

    integrations = await repos.integrations.list_integrations(user_id, enabled_only=True)
    servers: dict[str, MCPServerConfig] = {}
    sig_parts: list[str] = []

    for row in integrations:
        if row.get("kind") != "mcp":
            continue
        entry = get_integration(row.get("system_integration_id", ""))
        if not entry or not entry.mcp:
            continue

        credential: dict = {}
        credential_id = row.get("credential_id")
        if credential_id:
            cred_row = await repos.credentials.get_credential(user_id, credential_id)
            if cred_row and cred_row.get("secret_cipher"):
                try:
                    credential = json.loads(decrypt(cred_row["secret_cipher"]))
                except (ValueError, TypeError):
                    logger.warning("MCP launcher: could not decrypt credential {}", credential_id)

        slug = row.get("slug") or entry.id
        servers[slug] = MCPServerConfig(
            command=entry.mcp.command,
            args=list(entry.mcp.args),
            env=_resolve_env(entry.mcp, credential),
            url=entry.mcp.url,
        )
        sig_parts.append(f"{slug}:{credential_id}")

    return servers, ",".join(sorted(sig_parts))
