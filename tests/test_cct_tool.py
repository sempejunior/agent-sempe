"""Testes da tool cct_search sobre uma base SQLite+FTS5 de fixture."""

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from cct_import_sqlite import SCHEMA  # noqa: E402

from nanobot.agent.tools.cct import CctSearchTool  # noqa: E402

_TEXTO = (
    "Mediador - Extrato Convenção Coletiva\n"
    "NÚMERO DE REGISTRO NO MTE: MG000001/2026\n"
    "CLÁUSULA TERCEIRA - PISO SALARIAL\n"
    "Fica estipulado o piso salarial de R$ 1.900,00 para os comerciários.\n"
    "CLÁUSULA DÉCIMA - VALE ALIMENTAÇÃO\n"
    "As empresas fornecerão vale alimentação de R$ 30,00 por dia trabalhado.\n"
)


@pytest.fixture
def cct_db(tmp_path):
    db_path = tmp_path / "ccts.db"
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)
    db.execute(
        """INSERT INTO ccts (numero_registro, uf, tipo_instrumento, vigencia_inicio,
                             vigencia_fim, entidade_laboral_nome, categoria_profissional, texto)
           VALUES ('MG000001/2026', 'MG', 'Convenção Coletiva', '2026-01-01', '2099-12-31',
                   'SINDICATO DOS COMERCIÁRIOS DE TESTE', 'Comerciários', ?)""",
        (_TEXTO,),
    )
    db.execute(
        """INSERT INTO ccts (numero_registro, uf, tipo_instrumento, vigencia_inicio,
                             vigencia_fim, entidade_laboral_nome, categoria_profissional, texto)
           VALUES ('SP000002/2020', 'SP', 'Convenção Coletiva', '2020-01-01', '2021-01-01',
                   'SINDICATO VENCIDO', 'Metalúrgicos', 'piso salarial antigo')""",
    )
    db.execute("INSERT INTO ccts_fts(ccts_fts) VALUES('rebuild')")
    db.commit()
    db.close()
    return db_path


async def test_search_finds_by_text_without_accents(cct_db):
    tool = CctSearchTool(db_path=cct_db)
    result = await tool.execute(query='comerciarios AND "vale alimentacao"')
    assert "MG000001/2026" in result
    assert "SINDICATO DOS COMERCI" in result


async def test_search_filters_expired_by_default(cct_db):
    tool = CctSearchTool(db_path=cct_db)
    result = await tool.execute(query="piso")
    assert "SP000002/2020" not in result
    result_all = await tool.execute(query="piso", apenas_vigentes=False)
    assert "SP000002/2020" in result_all


async def test_detail_returns_clause_index_and_trecho(cct_db):
    tool = CctSearchTool(db_path=cct_db)
    indice = await tool.execute(numero_registro="MG000001/2026")
    assert "CLÁUSULA TERCEIRA" in indice
    trecho = await tool.execute(numero_registro="MG000001/2026", trecho="vale alimentação")
    assert "R$ 30,00" in trecho


async def test_missing_base_returns_error(tmp_path):
    tool = CctSearchTool(db_path=tmp_path / "nao-existe.db")
    result = await tool.execute(query="piso")
    assert result.startswith("Error")
