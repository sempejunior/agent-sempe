#!/usr/bin/env python3
"""Importa um dump PostgreSQL (pg_dump plain) da tabela tb_dp_cct para SQLite+FTS5.

Uso:
    python3 cct_import_sqlite.py <dump.sql> <saida.db>

Idempotente: upsert por numero_registro (a chave de unicidade do pipeline
Sindicatos). Cria o índice FTS5 `ccts_fts` sobre texto, categorias e entidade
laboral para busca da tool `cct_search`.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

COPY_PREFIX = "COPY public.tb_dp_cct "
COLUMNS = [
    "id", "cnpj", "uf", "numero_registro", "tipo_instrumento", "data_registro",
    "vigencia_inicio", "vigencia_fim", "entidade_laboral_nome",
    "entidade_laboral_cnpj", "categoria_profissional", "categoria_economica",
    "texto", "created_at", "updated_at", "deleted_at",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS ccts (
    numero_registro     TEXT PRIMARY KEY,
    cnpj                TEXT,
    uf                  TEXT,
    tipo_instrumento    TEXT,
    data_registro       TEXT,
    vigencia_inicio     TEXT,
    vigencia_fim        TEXT,
    entidade_laboral_nome TEXT,
    entidade_laboral_cnpj TEXT,
    categoria_profissional TEXT,
    categoria_economica TEXT,
    texto               TEXT,
    updated_at          TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS ccts_fts USING fts5(
    entidade_laboral_nome,
    categoria_profissional,
    categoria_economica,
    texto,
    content='ccts',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);
CREATE INDEX IF NOT EXISTS idx_ccts_uf ON ccts(uf);
CREATE INDEX IF NOT EXISTS idx_ccts_vigencia ON ccts(vigencia_fim);
"""


def _unescape(field: str) -> str | None:
    if field == "\\N":
        return None
    out = []
    it = iter(range(len(field)))
    i = 0
    while i < len(field):
        ch = field[i]
        if ch == "\\" and i + 1 < len(field):
            nxt = field[i + 1]
            mapped = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\"}.get(nxt)
            if mapped is not None:
                out.append(mapped)
                i += 2
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def iter_copy_rows(dump_path: Path):
    in_copy = False
    with dump_path.open("r", encoding="utf-8") as f:
        for line in f:
            if not in_copy:
                if line.startswith(COPY_PREFIX):
                    in_copy = True
                continue
            line = line.rstrip("\n")
            if line == "\\.":
                return
            fields = line.split("\t")
            if len(fields) != len(COLUMNS):
                print(f"aviso: linha com {len(fields)} campos ignorada", file=sys.stderr)
                continue
            yield dict(zip(COLUMNS, (_unescape(f) for f in fields)))


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    dump_path, db_path = Path(sys.argv[1]), Path(sys.argv[2])

    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)

    inserted = updated = skipped = 0
    for row in iter_copy_rows(dump_path):
        registro = row["numero_registro"]
        if not registro:
            skipped += 1
            continue
        existing = db.execute(
            "SELECT updated_at FROM ccts WHERE numero_registro = ?", (registro,)
        ).fetchone()
        db.execute(
            """INSERT INTO ccts (numero_registro, cnpj, uf, tipo_instrumento, data_registro,
                                 vigencia_inicio, vigencia_fim, entidade_laboral_nome,
                                 entidade_laboral_cnpj, categoria_profissional,
                                 categoria_economica, texto, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(numero_registro) DO UPDATE SET
                   cnpj=excluded.cnpj, uf=excluded.uf,
                   tipo_instrumento=excluded.tipo_instrumento,
                   data_registro=excluded.data_registro,
                   vigencia_inicio=excluded.vigencia_inicio,
                   vigencia_fim=excluded.vigencia_fim,
                   entidade_laboral_nome=excluded.entidade_laboral_nome,
                   entidade_laboral_cnpj=excluded.entidade_laboral_cnpj,
                   categoria_profissional=excluded.categoria_profissional,
                   categoria_economica=excluded.categoria_economica,
                   texto=excluded.texto, updated_at=excluded.updated_at""",
            (
                registro, row["cnpj"], row["uf"], row["tipo_instrumento"],
                row["data_registro"], row["vigencia_inicio"], row["vigencia_fim"],
                row["entidade_laboral_nome"], row["entidade_laboral_cnpj"],
                row["categoria_profissional"], row["categoria_economica"],
                row["texto"], row["updated_at"],
            ),
        )
        if existing:
            updated += 1
        else:
            inserted += 1

    db.execute("INSERT INTO ccts_fts(ccts_fts) VALUES('rebuild')")
    db.commit()

    total = db.execute("SELECT COUNT(*) FROM ccts").fetchone()[0]
    print(f"importados: {inserted} novos, {updated} atualizados, {skipped} sem registro")
    print(f"total na base: {total} | arquivo: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
