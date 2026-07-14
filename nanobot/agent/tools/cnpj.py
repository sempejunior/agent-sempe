"""Public CNPJ registry lookup (Receita Federal data via BrasilAPI/minhareceita)."""

import re
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool

_BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
_MINHARECEITA_URL = "https://minhareceita.org/{cnpj}"
_TIMEOUT_S = 20.0


class CnpjLookupTool(Tool):
    """Consulta dados cadastrais públicos de um CNPJ.

    Retorna razão social, CNAE principal e secundários, município/UF, porte e
    situação cadastral — a base determinística para enquadramento sindical.
    """

    @property
    def name(self) -> str:
        return "cnpj_lookup"

    @property
    def description(self) -> str:
        return (
            "Consulta os dados cadastrais públicos de um CNPJ (Receita Federal): razão social, "
            "CNAE principal e secundários, município/UF, porte e situação. Use como primeiro "
            "passo para enquadramento sindical: o par CNAE + município define o sindicato e a "
            "convenção coletiva aplicáveis."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "cnpj": {
                    "type": "string",
                    "description": "CNPJ com ou sem máscara (ex.: 00.000.000/0001-91).",
                },
            },
            "required": ["cnpj"],
        }

    async def execute(self, **kwargs: Any) -> str:
        cnpj = re.sub(r"\D", "", kwargs.get("cnpj", ""))
        if len(cnpj) != 14:
            return "Error: CNPJ inválido — informe 14 dígitos (com ou sem máscara)."

        data, source = await self._fetch(cnpj)
        if data is None:
            return f"Error: não foi possível consultar o CNPJ {cnpj} nas fontes públicas. Tente novamente."
        return self._format(cnpj, data, source)

    async def _fetch(self, cnpj: str) -> tuple[dict[str, Any] | None, str]:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S, follow_redirects=True) as client:
            for url, source in (
                (_BRASILAPI_URL.format(cnpj=cnpj), "BrasilAPI"),
                (_MINHARECEITA_URL.format(cnpj=cnpj), "minhareceita.org"),
            ):
                try:
                    response = await client.get(url)
                    if response.status_code == 200:
                        return response.json(), source
                    if response.status_code == 404:
                        return None, source
                except httpx.HTTPError:
                    continue
        return None, ""

    @staticmethod
    def _format(cnpj: str, data: dict[str, Any], source: str) -> str:
        secondary = data.get("cnaes_secundarios") or []
        secondary_lines = [
            f"  - {c.get('codigo')}: {c.get('descricao')}"
            for c in secondary[:10]
            if isinstance(c, dict) and c.get("codigo")
        ]
        lines = [
            f"CNPJ: {cnpj} (fonte: {source})",
            f"Razão social: {data.get('razao_social', '?')}",
            f"Nome fantasia: {data.get('nome_fantasia') or '-'}",
            f"Situação: {data.get('descricao_situacao_cadastral', data.get('situacao_cadastral', '?'))}",
            f"Porte: {data.get('porte') or data.get('descricao_porte') or '-'}",
            f"Município/UF: {data.get('municipio', '?')}/{data.get('uf', '?')}",
            f"CNAE principal: {data.get('cnae_fiscal', '?')} — "
            f"{data.get('cnae_fiscal_descricao', '?')}",
        ]
        if secondary_lines:
            lines.append("CNAEs secundários:")
            lines.extend(secondary_lines)
        if len(secondary) > 10:
            lines.append(f"  (+{len(secondary) - 10} CNAEs secundários omitidos)")
        return "\n".join(lines)
