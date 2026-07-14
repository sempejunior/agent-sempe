"""Testes da tool cnpj_lookup (HTTP mockado)."""

from unittest.mock import AsyncMock, MagicMock, patch

from nanobot.agent.tools.cnpj import CnpjLookupTool

_PAYLOAD = {
    "razao_social": "PADARIA EXEMPLO LTDA",
    "nome_fantasia": "Pão Quente",
    "descricao_situacao_cadastral": "ATIVA",
    "porte": "ME",
    "municipio": "CONTAGEM",
    "uf": "MG",
    "cnae_fiscal": 1091102,
    "cnae_fiscal_descricao": "Fabricação de produtos de padaria e confeitaria",
    "cnaes_secundarios": [{"codigo": 4721102, "descricao": "Padaria e confeitaria"}],
}


def _mock_client(status=200, payload=_PAYLOAD):
    response = MagicMock(status_code=status)
    response.json.return_value = payload
    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client


async def test_lookup_formats_registry_data():
    tool = CnpjLookupTool()
    with patch("nanobot.agent.tools.cnpj.httpx.AsyncClient", return_value=_mock_client()):
        result = await tool.execute(cnpj="12.345.678/0001-95")
    assert "PADARIA EXEMPLO LTDA" in result
    assert "CONTAGEM/MG" in result
    assert "1091102" in result


async def test_invalid_cnpj_is_rejected_without_http():
    tool = CnpjLookupTool()
    result = await tool.execute(cnpj="123")
    assert result.startswith("Error")


async def test_not_found_returns_error():
    tool = CnpjLookupTool()
    with patch("nanobot.agent.tools.cnpj.httpx.AsyncClient", return_value=_mock_client(status=404)):
        result = await tool.execute(cnpj="12345678000195")
    assert result.startswith("Error")
