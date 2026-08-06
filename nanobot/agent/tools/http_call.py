"""Generic HTTP tool that dispatches to activated user integrations.

Instead of exposing one tool per API endpoint, we expose a single
``http_call`` tool. Its description lists the user's active API integrations
plus the endpoints available in each. The agent picks integration + endpoint
and provides the parameters; this tool resolves the credential, builds the URL,
attaches auth, and performs the request.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool
from nanobot.integrations.catalog import (
    APIEndpoint,
    AuthSpec,
    IntegrationEntry,
    get_integration,
)
from nanobot.utils import crypto

_TIMEOUT = 30.0
_MAX_BODY_CHARS = 12_000


class HttpCallTool(Tool):
    """Call any endpoint declared by an activated API integration."""

    def __init__(
        self,
        *,
        user_id: str,
        integration_repo: Any,
        credential_repo: Any,
    ):
        self.user_id = user_id
        self.integration_repo = integration_repo
        self.credential_repo = credential_repo

    @property
    def name(self) -> str:
        return "http_call"

    @property
    def description(self) -> str:
        return (
            "Faz uma chamada HTTP em uma das APIs integradas ao usuário. "
            "Use quando o usuário pedir uma ação em GitHub, Jira, Notion, "
            "Slack, Grafana, Google Workspace ou qualquer API cadastrada. "
            "Os integration_slug e endpoint_key disponíveis estão na seção "
            "'Integrations & MCPs' do seu contexto. Identidade (tenant, empresa, "
            "usuário) vem da credencial da integração — não a envie no body."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "integration_slug": {
                    "type": "string",
                    "description": "Slug da integração ativa (ver /api/integrations).",
                },
                "endpoint_key": {
                    "type": "string",
                    "description": "Chave do endpoint declarado no catálogo da integração.",
                },
                "path_params": {
                    "type": "object",
                    "description": "Substituições de placeholders no path (ex: {owner}, {repo}).",
                },
                "query": {
                    "type": "object",
                    "description": "Query string parameters.",
                },
                "body": {
                    "type": "object",
                    "description": "JSON body para métodos POST/PUT/PATCH.",
                },
                "headers": {
                    "type": "object",
                    "description": "Headers extras opcionais.",
                },
            },
            "required": ["integration_slug", "endpoint_key"],
        }

    async def execute(self, **kwargs: Any) -> str:
        slug = str(kwargs.get("integration_slug", "")).strip()
        endpoint_key = str(kwargs.get("endpoint_key", "")).strip()
        if not slug or not endpoint_key:
            return "Error: integration_slug and endpoint_key are required."

        integration = await self.integration_repo.get_integration(self.user_id, slug)
        if not integration:
            return f"Error: integration '{slug}' is not activated for this user."
        if not integration.get("enabled"):
            return f"Error: integration '{slug}' is disabled."
        if integration["kind"] != "api":
            return f"Error: integration '{slug}' is not an API (kind={integration['kind']})."

        system_id = integration.get("system_integration_id")
        entry = get_integration(system_id) if system_id else None
        overrides = integration.get("config") or {}
        if not entry:
            return self._call_custom(integration, overrides, kwargs)

        endpoint = self._find_endpoint(entry, endpoint_key)
        if not endpoint:
            available = ", ".join(e.key for e in (entry.api.endpoints if entry.api else ()))
            return f"Error: endpoint '{endpoint_key}' not found. Available: {available}"

        credentials = await self._load_credential(integration.get("credential_id"))
        return await self._perform(entry, endpoint, overrides, credentials, kwargs)

    @staticmethod
    def _find_endpoint(entry: IntegrationEntry, key: str) -> APIEndpoint | None:
        if not entry.api:
            return None
        for endpoint in entry.api.endpoints:
            if endpoint.key == key:
                return endpoint
        return None

    async def _load_credential(self, credential_id: int | None) -> dict[str, str]:
        if not credential_id:
            return {}
        row = await self.credential_repo.get_credential(self.user_id, credential_id)
        if not row:
            return {}
        cipher = row.get("secret_cipher", "")
        plaintext = crypto.decrypt(cipher) if cipher else ""
        if not plaintext:
            return {}
        try:
            data = json.loads(plaintext)
            if isinstance(data, dict):
                return {k: str(v) for k, v in data.items()}
        except json.JSONDecodeError:
            pass
        return {"token": plaintext}

    async def _perform(
        self,
        entry: IntegrationEntry,
        endpoint: APIEndpoint,
        overrides: dict[str, Any],
        credentials: dict[str, str],
        kwargs: dict[str, Any],
    ) -> str:
        assert entry.api is not None
        base_url = (overrides.get("base_url")
                    or credentials.get("base_url")
                    or entry.api.base_url).rstrip("/")
        if not base_url:
            return f"Error: integration '{entry.id}' has no base_url configured."

        try:
            path = self._resolve_path(endpoint.path, kwargs.get("path_params") or {}, credentials)
        except KeyError as exc:
            return f"Error: missing path parameter {exc}."

        url = f"{base_url}{path}"
        headers = dict(entry.api.default_headers or {})
        headers.update(overrides.get("default_headers", {}) or {})
        extra_headers = kwargs.get("headers") or {}
        headers.update(extra_headers)

        auth = self._apply_auth(entry.auth, credentials, headers)

        query = kwargs.get("query") or {}
        if entry.auth.mode == "query_key" and entry.auth.query_param:
            secret = credentials.get(entry.auth.secret_field, "")
            if secret:
                query = {**query, entry.auth.query_param: secret}

        body = kwargs.get("body")
        json_body = body if isinstance(body, (dict, list)) else None
        json_body = self._inject_credential_body(entry, endpoint, credentials, json_body)

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.request(
                    endpoint.method,
                    url,
                    params=query or None,
                    json=json_body,
                    headers=headers,
                    auth=auth,
                )
        except httpx.RequestError as exc:
            return f"Error: HTTP request failed: {exc}"

        return self._format_response(endpoint, response)

    def _call_custom(
        self, integration: dict[str, Any], overrides: dict[str, Any], kwargs: dict[str, Any],
    ) -> str:
        return (
            f"Error: integration '{integration['slug']}' is a custom API and does not "
            "yet declare endpoints. Custom endpoints are not implemented in this milestone."
        )

    @staticmethod
    def _inject_credential_body(
        entry: IntegrationEntry,
        endpoint: APIEndpoint,
        credentials: dict[str, str],
        body: Any,
    ) -> Any:
        """Overwrite body fields the integration binds to credential fields.

        The credential wins over whatever the model sent: identity belongs to
        the activated integration, not to the LLM. Credential fields that are
        empty are left out so the API rejects the call instead of the agent
        reporting a false success.
        """
        assert entry.api is not None
        mapping = {**entry.api.body_from_credential, **endpoint.body_from_credential}
        resolved = {
            field_name: credentials[cred_key]
            for field_name, cred_key in mapping.items()
            if credentials.get(cred_key)
        }
        if not resolved:
            return body
        if isinstance(body, list):
            return body
        return {**(body if isinstance(body, dict) else {}), **resolved}

    @staticmethod
    def _resolve_path(
        template: str, path_params: dict[str, Any], credentials: dict[str, str],
    ) -> str:
        merged = {**credentials, **{k: str(v) for k, v in path_params.items()}}
        return template.format_map(merged)

    @staticmethod
    def _apply_auth(
        spec: AuthSpec, credentials: dict[str, str], headers: dict[str, str],
    ) -> tuple[str, str] | None:
        if spec.mode == "bearer":
            secret = credentials.get(spec.secret_field, "")
            if secret:
                headers[spec.header_name] = f"{spec.header_prefix}{secret}"
            return None
        if spec.mode == "api_key_header":
            secret = credentials.get(spec.secret_field, "")
            if secret:
                headers[spec.header_name] = secret
            return None
        if spec.mode == "basic":
            username = credentials.get(spec.username_field, "") if spec.username_field else ""
            password = credentials.get(spec.password_field, "")
            token = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {token}"
            return None
        return None

    @staticmethod
    def _format_response(endpoint: APIEndpoint, response: httpx.Response) -> str:
        content_type = response.headers.get("content-type", "").lower()
        head = f"{endpoint.method} {response.request.url} -> {response.status_code}"
        try:
            if "application/json" in content_type:
                payload = json.dumps(response.json(), ensure_ascii=False, indent=2)
            else:
                payload = response.text
        except (ValueError, json.JSONDecodeError):
            payload = response.text
        if len(payload) > _MAX_BODY_CHARS:
            payload = payload[:_MAX_BODY_CHARS] + f"\n… [truncated, {len(payload)} chars]"
        prefix = "" if response.is_success else "[HTTP error] "
        return f"{prefix}{head}\n{payload}"
