#!/usr/bin/env python3
"""Carrega extratos .doc (HTML) do Mediador direto para a base SQLite de CCTs.

Uso:
    python3 cct_load_docs.py <saida.db> <pasta_com_docs> [<pasta2> ...]

Substitui a etapa Postgres do pipeline Sindicatos: parseia os extratos HTML
baixados pelos downloaders (nome do arquivo = CNPJ do sindicato) e faz upsert
idempotente por numero_registro na mesma base criada por cct_import_sqlite.py.
Parsing portado de Sindicatos/load_tb_dp_cct.py (regexes dos extratos).
"""

from __future__ import annotations

import html
import re
import sqlite3
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from cct_import_sqlite import SCHEMA

RE_REGISTRO = re.compile(r"REGISTRO NO MTE:?\s*([A-Z]{2}\d{6}/\d{4})", re.IGNORECASE)
RE_DATA_REGISTRO = re.compile(
    r"DATA DE REGISTRO NO MTE:?\s*(\d{2}/\d{2}/\d{4})", re.IGNORECASE,
)
RE_VIGENCIA = re.compile(
    r"vig[êe]ncia[^\n]{0,260}?(\d{2}/\d{2}/\d{4})[^\n]{0,120}?a[^\n]{0,120}?(\d{2}/\d{2}/\d{4})",
    re.IGNORECASE,
)
RE_VIGENCIA_LONGA = re.compile(
    r"vig[êe]ncia[\s\S]{0,120}?(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})"
    r"[\s\S]{0,80}?a\s+(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})",
    re.IGNORECASE,
)
_MESES = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5,
    "junho": 6, "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10,
    "novembro": 11, "dezembro": 12,
}
RE_CNPJ = re.compile(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})")
RE_CAT_PROF = re.compile(r"categoria\(s\)\s*,?\s*(.+?)\s*,\s*com\s+abrang", re.IGNORECASE)
RE_CAT_ECON = re.compile(r"categoria\s+econ[ôo]mica\s*[:\-]?\s*(.+)", re.IGNORECASE)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._parts)


def _to_iso(d: str | None) -> str | None:
    if not d:
        return None
    try:
        return datetime.strptime(d, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def _long_to_iso(day: str, month_name: str, year: str) -> str | None:
    month = _MESES.get(month_name.lower())
    if not month:
        return None
    try:
        return datetime(int(year), month, int(day)).date().isoformat()
    except ValueError:
        return None


def _pick_vigencia(text: str) -> tuple[str | None, str | None]:
    m = RE_VIGENCIA.search(text)
    if m:
        return _to_iso(m.group(1)), _to_iso(m.group(2))
    m = RE_VIGENCIA_LONGA.search(text)
    if m:
        return (
            _long_to_iso(m.group(1), m.group(2), m.group(3)),
            _long_to_iso(m.group(4), m.group(5), m.group(6)),
        )
    return None, None


def parse_doc(path: Path) -> dict | None:
    raw = path.read_bytes().decode("latin-1", errors="ignore")
    extractor = _TextExtractor()
    extractor.feed(raw)
    text = html.unescape(extractor.text())
    m = RE_REGISTRO.search(text)
    if not m:
        return None

    tipo = None
    lowered = text.lower()
    for needle, label in (
        ("termo aditivo", "Termo Aditivo"),
        ("convenção coletiva", "Convenção Coletiva"),
        ("convencao coletiva", "Convenção Coletiva"),
        ("acordo coletivo", "Acordo Coletivo"),
    ):
        if needle in lowered[:2000]:
            tipo = label
            break

    vigencia_inicio, vigencia_fim = _pick_vigencia(text)
    data_reg = RE_DATA_REGISTRO.search(text)
    cat_prof = RE_CAT_PROF.search(text)
    cat_econ = RE_CAT_ECON.search(text)

    entidade_nome = entidade_cnpj = None
    for line in text.splitlines():
        upper = line.upper()
        if "CNPJ" not in upper:
            continue
        if not any(k in upper for k in ("SIND", "FEDER", "CONFED", "CENTRAL")):
            continue
        c = RE_CNPJ.search(line)
        if c:
            entidade_cnpj = re.sub(r"\D", "", c.group(1))
            entidade_nome = line[: c.start()].strip(" ,;-")[:500]
        else:
            entidade_nome = line.strip()[:500]
        break

    registro = m.group(1)
    return {
        "numero_registro": registro,
        "cnpj": path.stem if path.stem.isdigit() and len(path.stem) == 14 else None,
        "uf": registro[:2],
        "tipo_instrumento": tipo,
        "data_registro": _to_iso(data_reg.group(1) if data_reg else None),
        "vigencia_inicio": vigencia_inicio,
        "vigencia_fim": vigencia_fim,
        "entidade_laboral_nome": entidade_nome,
        "entidade_laboral_cnpj": entidade_cnpj,
        "categoria_profissional": (cat_prof.group(1).strip()[:3000] if cat_prof else None),
        "categoria_economica": (cat_econ.group(1).strip()[:3000] if cat_econ else None),
        "texto": text,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    db_path = Path(sys.argv[1])
    folders = [Path(p) for p in sys.argv[2:]]

    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)

    novos = atualizados = falhas = 0
    for folder in folders:
        for doc in sorted(folder.glob("*.doc")):
            try:
                row = parse_doc(doc)
            except Exception as e:
                print(f"falha em {doc.name}: {e}", file=sys.stderr)
                falhas += 1
                continue
            if row is None:
                falhas += 1
                continue
            existed = db.execute(
                "SELECT 1 FROM ccts WHERE numero_registro = ?", (row["numero_registro"],)
            ).fetchone()
            db.execute(
                """INSERT INTO ccts (numero_registro, cnpj, uf, tipo_instrumento, data_registro,
                                     vigencia_inicio, vigencia_fim, entidade_laboral_nome,
                                     entidade_laboral_cnpj, categoria_profissional,
                                     categoria_economica, texto, updated_at)
                   VALUES (:numero_registro, :cnpj, :uf, :tipo_instrumento, :data_registro,
                           :vigencia_inicio, :vigencia_fim, :entidade_laboral_nome,
                           :entidade_laboral_cnpj, :categoria_profissional,
                           :categoria_economica, :texto, :updated_at)
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
                row,
            )
            if existed:
                atualizados += 1
            else:
                novos += 1

    db.execute("INSERT INTO ccts_fts(ccts_fts) VALUES('rebuild')")
    db.commit()
    total = db.execute("SELECT COUNT(*) FROM ccts").fetchone()[0]
    print(f"docs: {novos} novos, {atualizados} atualizados, {falhas} falhas | total: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
