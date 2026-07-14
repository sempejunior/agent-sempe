"""Search tool over the local CCT base (Mediador/MTE instruments in SQLite+FTS5).

The base is produced by ``scripts/cct_import_sqlite.py`` (bulk import from the
Sindicatos pipeline dump) and refreshed by the periodic sync job. Tools read
only; the writer is the import/sync script.
"""

from __future__ import annotations

import asyncio
import re
import sqlite3
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool

_DEFAULT_DB = Path.home() / ".nanobot" / "ccts.db"
_MAX_RESULTS = 15
_WINDOW_CHARS = 700


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


class CctSearchTool(Tool):
    """Consulta a base local de convenções e acordos coletivos registrados no MTE."""

    def __init__(self, db_path: Path | None = None):
        self._db_path = db_path or _DEFAULT_DB

    @property
    def name(self) -> str:
        return "cct_search"

    @property
    def description(self) -> str:
        return (
            "Busca na BASE LOCAL de convenções e acordos coletivos (CCT/ACT) registrados no "
            "Mediador/MTE — use SEMPRE antes de procurar CCT na web. Dois modos: (1) busca: "
            "passe `query` (sintaxe FTS: termos, AND/OR, \"frase exata\"; acentos são "
            "ignorados) e filtros opcionais `uf`/`apenas_vigentes` para listar instrumentos; "
            "(2) detalhe: passe `numero_registro` (e opcionalmente `trecho`, ex.: 'piso', "
            "'vale alimentação') para ler as cláusulas relevantes do texto integral."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Termos de busca FTS (ex.: 'comerciarios AND \"vale alimentacao\"').",
                },
                "uf": {"type": "string", "description": "Filtro por UF (ex.: 'SP')."},
                "numero_registro": {
                    "type": "string",
                    "description": "Modo detalhe: número de registro MTE (ex.: 'SP001234/2025').",
                },
                "trecho": {
                    "type": "string",
                    "description": "No modo detalhe: palavra-chave para extrair as cláusulas relevantes.",
                },
                "apenas_vigentes": {
                    "type": "boolean",
                    "description": "Só instrumentos com vigência ativa (default true).",
                },
                "limit": {"type": "integer", "description": "Máximo de resultados (default 5, teto 15)."},
            },
        }

    async def execute(self, **kwargs: Any) -> str:
        if not self._db_path.exists():
            return (
                f"Error: base de CCTs não encontrada em {self._db_path}. "
                "Rode scripts/cct_import_sqlite.py para criá-la."
            )
        return await asyncio.to_thread(self._run, kwargs)

    def _run(self, kwargs: dict[str, Any]) -> str:
        db = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        try:
            registro = (kwargs.get("numero_registro") or "").strip()
            if registro:
                return self._detail(db, registro, (kwargs.get("trecho") or "").strip())
            query = (kwargs.get("query") or "").strip()
            if not query:
                return "Error: informe `query` para buscar ou `numero_registro` para detalhar."
            return self._search(db, query, kwargs)
        finally:
            db.close()

    def _search(self, db: sqlite3.Connection, query: str, kwargs: dict[str, Any]) -> str:
        limit = min(int(kwargs.get("limit") or 5), _MAX_RESULTS)
        apenas_vigentes = kwargs.get("apenas_vigentes", True)
        uf = (kwargs.get("uf") or "").strip().upper()

        sql = (
            "SELECT c.numero_registro, c.uf, c.tipo_instrumento, c.entidade_laboral_nome, "
            "c.categoria_profissional, c.vigencia_inicio, c.vigencia_fim, "
            "snippet(ccts_fts, 3, '[', ']', ' … ', 16) AS trecho "
            "FROM ccts_fts JOIN ccts c ON c.rowid = ccts_fts.rowid "
            "WHERE ccts_fts MATCH ?"
        )
        params: list[Any] = [query]
        if uf:
            sql += " AND c.uf = ?"
            params.append(uf)
        if apenas_vigentes:
            sql += " AND c.vigencia_fim >= ?"
            params.append(date.today().isoformat())
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)

        try:
            rows = db.execute(sql, params).fetchall()
        except sqlite3.OperationalError as e:
            return f"Error: consulta FTS inválida ({e}). Ajuste a sintaxe de `query`."

        if not rows:
            return (
                "Nenhum instrumento encontrado na base local para essa busca. "
                "Tente termos mais amplos, desligue `apenas_vigentes`, ou pesquise na web."
            )
        lines = [f"{len(rows)} instrumento(s) na base local:"]
        for r in rows:
            categoria = (r["categoria_profissional"] or "").strip().replace("\n", " ")[:90]
            lines.append(
                f"- {r['numero_registro']} [{r['uf']}] {r['tipo_instrumento'] or '?'} | "
                f"{(r['entidade_laboral_nome'] or '?')[:80]} | vigência "
                f"{r['vigencia_inicio']} a {r['vigencia_fim']}"
                + (f" | categoria: {categoria}" if categoria else "")
                + f"\n  trecho: {r['trecho'][:220]}"
            )
        lines.append(
            "Use cct_search com numero_registro (+ trecho, ex.: 'piso', 'alimentação') "
            "para ler as cláusulas."
        )
        return "\n".join(lines)

    def _detail(self, db: sqlite3.Connection, registro: str, trecho: str) -> str:
        row = db.execute(
            "SELECT * FROM ccts WHERE numero_registro = ?", (registro,)
        ).fetchone()
        if not row:
            return f"Error: registro {registro} não encontrado na base local."

        header = (
            f"{row['numero_registro']} [{row['uf']}] {row['tipo_instrumento'] or '?'}\n"
            f"Entidade laboral: {row['entidade_laboral_nome'] or '?'}\n"
            f"Categoria: {(row['categoria_profissional'] or '?')[:200]}\n"
            f"Vigência: {row['vigencia_inicio']} a {row['vigencia_fim']} | "
            f"registro em {row['data_registro']}"
        )
        texto = row["texto"] or ""
        if not trecho:
            clausulas = re.findall(r"^CL[ÁA]USULA[^\n]{0,120}", texto, re.MULTILINE | re.IGNORECASE)
            indice = "\n".join(f"  {c.strip()}" for c in clausulas[:60])
            return (
                f"{header}\n\nÍndice de cláusulas ({len(clausulas)}):\n{indice}\n\n"
                "Passe `trecho` (ex.: 'piso', 'vale alimentação') para ler o conteúdo."
            )

        folded_text = _fold(texto)
        needle = _fold(trecho)
        windows: list[str] = []
        start = 0
        while len(windows) < 6:
            idx = folded_text.find(needle, start)
            if idx < 0:
                break
            lo = max(0, idx - _WINDOW_CHARS // 3)
            hi = min(len(texto), idx + _WINDOW_CHARS)
            windows.append(texto[lo:hi].strip())
            start = idx + len(needle)
        if not windows:
            return f"{header}\n\n'{trecho}' não aparece no texto deste instrumento."
        body = "\n\n[...]\n\n".join(windows)
        return f"{header}\n\nTrechos com '{trecho}':\n\n{body}"
