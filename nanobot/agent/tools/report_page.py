"""Publish self-contained HTML pages and return a secret link to open them.

Two tools live here:
- ``PublishPageTool`` (publish_page): the agent authors the full HTML itself.
- ``PublishReportTool`` (publish_report): the agent sends structured content
  (sections with cards/bars/columns/table/text blocks) and the tool renders a
  rich, consistent page — sidebar nav, dark theme, CSS charts — guaranteeing
  visual quality regardless of the model's output budget or the data domain.

Both write under ``<workspace>/reports/<token>.html`` and return a link to
``/r/<token>``, served with a script-blocking CSP. The link is absolute when
``gateway.public_url`` is configured, otherwise relative to the app origin.
"""

from __future__ import annotations

import html as htmllib
import uuid
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool


class PublishPageTool(Tool):
    """Write a self-contained HTML page to the reports dir and return its link."""

    def __init__(self, workspace: Path, public_url: str | None = None):
        self._reports_dir = Path(workspace) / "reports"
        self._public_url = (public_url or "").rstrip("/")

    @property
    def name(self) -> str:
        return "publish_page"

    @property
    def description(self) -> str:
        return (
            "Publica uma página HTML autocontida e retorna um link secreto que o usuário "
            "abre no navegador. Use para entregar relatórios e dashboards gerados por "
            "você. O HTML deve ser 100% autocontido: todo o CSS inline em <style>, SEM "
            "<script> (scripts não são executados na página servida) e SEM recursos "
            "externos ou CDN (fontes/imagens por URL). Imagens apenas como data URI."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Título da página, para referência ao usuário.",
                },
                "html": {
                    "type": "string",
                    "description": (
                        "Documento HTML completo e autocontido "
                        "(<!DOCTYPE html> … </html>), com CSS inline e sem scripts."
                    ),
                },
            },
            "required": ["title", "html"],
        }

    async def execute(self, **kwargs: Any) -> str:
        title = str(kwargs.get("title", "")).strip() or "Relatório"
        html = kwargs.get("html", "")
        if not isinstance(html, str) or "<" not in html:
            return (
                "Error: 'html' vazio ou inválido. Envie um documento HTML completo "
                "e autocontido (CSS inline, sem scripts, sem recursos externos)."
            )
        token = uuid.uuid4().hex
        self._reports_dir.mkdir(parents=True, exist_ok=True)
        (self._reports_dir / f"{token}.html").write_text(html, encoding="utf-8")
        link = f"{self._public_url}/r/{token}" if self._public_url else f"/r/{token}"
        return (
            f"Página publicada com sucesso.\n"
            f"Título: {title}\n"
            f"Link: {link}\n"
            f"Entregue ao usuário como link markdown, ex.: [Abrir página]({link})\n"
            f"O link é secreto: qualquer pessoa com o link consegue abrir."
        )


_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

_REPORT_CSS = """
:root{--bg:#0f1420;--panel:#161d2e;--card:#1c2538;--line:#26304a;--txt:#e6ebf5;--mut:#93a0bd;--acc:#4f8cff}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--txt)}
.layout{display:flex;min-height:100vh}
.sidebar{width:250px;background:#0c111c;border-right:1px solid var(--line);position:fixed;top:0;bottom:0;overflow-y:auto;padding:20px 0}
.sidebar .brand{padding:0 20px 16px;font-weight:700;font-size:15px;color:var(--acc);border-bottom:1px solid var(--line);margin-bottom:10px}
.nav-link{display:block;padding:9px 20px;color:var(--mut);text-decoration:none;font-size:14px;border-left:3px solid transparent}
.nav-link:hover{background:#131a2a;color:var(--txt);border-left-color:var(--acc)}
.content{margin-left:250px;padding:36px 48px;max-width:1100px}
h1{font-size:26px;margin:0 0 6px}
h2{font-size:21px;margin:0 0 14px;border-bottom:1px solid var(--line);padding-bottom:8px}
h3{font-size:15px;margin:0 0 14px;color:var(--mut)}
.subtitle{color:var(--mut);margin:0 0 26px;font-size:13px}
section{margin-bottom:46px;scroll-margin-top:20px}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;min-width:130px;flex:1}
.card-val{font-size:24px;font-weight:700}.card-lbl{color:var(--mut);font-size:12px;margin-top:4px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:18px}
.bar-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
.bar-label{width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{flex:1;background:#0e1422;border-radius:6px;height:14px;overflow:hidden}
.bar-fill{display:block;height:100%;border-radius:6px}
.bar-val{width:90px;text-align:right;color:var(--mut)}
.month-chart{display:flex;gap:8px;align-items:flex-end;height:150px;padding-top:10px}
.mb-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.mb-bar-wrap{flex:1;width:60%;display:flex;align-items:flex-end}
.mb-bar{width:100%;background:linear-gradient(180deg,#4f8cff,#2b5fd0);border-radius:5px 5px 0 0;min-height:2px}
.mb-val{font-size:11px;color:var(--mut);margin-top:4px}.mb-lbl{font-size:10px;color:#5b6a8c}
table.rank{width:100%;border-collapse:collapse;font-size:14px}
table.rank th,table.rank td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}
table.rank th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
table.rank tr:hover{background:#131a2a}
.reading{color:#b9c6e3;font-size:13px;line-height:1.6;margin:10px 0 0;padding-left:12px;border-left:3px solid var(--acc)}
.note{background:#1b2033;border:1px solid #3a4266;border-radius:10px;padding:12px 16px;font-size:13px;color:var(--mut);line-height:1.7;margin-bottom:18px}
.text-body{font-size:14px;line-height:1.8;color:var(--txt);white-space:pre-wrap}
@media(max-width:820px){.content{margin-left:0;padding:20px}.sidebar{display:none}}
"""

_BAR_COLORS = ["#4f8cff", "#22c3a6", "#f0a93b", "#a07bff", "#e0556b"]


def _esc(v: Any) -> str:
    return htmllib.escape(str(v))


def _render_reading(block: dict) -> str:
    reading = block.get("reading")
    return f'<p class="reading">{_esc(reading)}</p>' if reading else ""


def _render_cards(block: dict) -> str:
    cards = "".join(
        f'<div class="card"><div class="card-val">{_esc(i.get("value", ""))}</div>'
        f'<div class="card-lbl">{_esc(i.get("label", ""))}</div></div>'
        for i in block.get("items", []) if isinstance(i, dict)
    )
    return f'<div class="cards">{cards}</div>{_render_reading(block)}'


def _render_bars(block: dict, color_idx: int) -> str:
    items = [i for i in block.get("items", []) if isinstance(i, dict)]
    values = [float(i.get("value", 0) or 0) for i in items]
    mx = max(values) if values and max(values) > 0 else 1.0
    color = block.get("color") or _BAR_COLORS[color_idx % len(_BAR_COLORS)]
    unit = block.get("unit", "")
    rows = []
    for item, val in zip(items, values):
        pct = round(100 * val / mx)
        display = item.get("display") or f"{item.get('value', '')}{unit}"
        rows.append(
            f'<div class="bar-row"><span class="bar-label">{_esc(item.get("label", ""))}</span>'
            f'<span class="bar-track"><span class="bar-fill" '
            f'style="width:{pct}%;background:{_esc(color)}"></span></span>'
            f'<span class="bar-val">{_esc(display)}</span></div>'
        )
    title = f'<h3>{_esc(block["title"])}</h3>' if block.get("title") else ""
    return f'<div class="panel">{title}{"".join(rows)}{_render_reading(block)}</div>'


def _pretty_label(key: str) -> str:
    parts = str(key).split("-")
    if len(parts) == 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= 12:
        return _MES[int(parts[1]) - 1]
    return str(key)


def _render_columns(block: dict) -> str:
    """Vertical column chart: time series ('YYYY-MM' keys) or any categories."""
    values = block.get("values")
    if isinstance(values, dict) and values:
        pairs = [(k, float(v or 0)) for k, v in sorted(values.items())]
    else:
        pairs = [(i.get("label", ""), float(i.get("value", 0) or 0))
                 for i in block.get("items", []) if isinstance(i, dict)]
    if not pairs:
        return ""
    mx = max(v for _, v in pairs) or 1.0
    cells = []
    for key, val in pairs:
        h = round(100 * val / mx)
        shown = int(val) if val.is_integer() else val
        cells.append(
            f'<div class="mb-col"><div class="mb-bar-wrap">'
            f'<div class="mb-bar" style="height:{h}%"></div></div>'
            f'<div class="mb-val">{_esc(shown) if val else ""}</div>'
            f'<div class="mb-lbl">{_esc(_pretty_label(key))}</div></div>'
        )
    title = f'<h3>{_esc(block["title"])}</h3>' if block.get("title") else ""
    return (f'<div class="panel">{title}<div class="month-chart">{"".join(cells)}</div>'
            f'{_render_reading(block)}</div>')


def _render_table(block: dict) -> str:
    columns = block.get("columns", [])
    head = "".join(f"<th>{_esc(c)}</th>" for c in columns)
    body = "".join(
        "<tr>" + "".join(f"<td>{_esc(c)}</td>" for c in row) + "</tr>"
        for row in block.get("rows", []) if isinstance(row, list)
    )
    title = f'<h3>{_esc(block["title"])}</h3>' if block.get("title") else ""
    return (f'<div class="panel">{title}<table class="rank"><thead><tr>{head}</tr></thead>'
            f'<tbody>{body}</tbody></table>{_render_reading(block)}</div>')


def _render_text(block: dict) -> str:
    title = f'<h3>{_esc(block["title"])}</h3>' if block.get("title") else ""
    return (f'<div class="panel">{title}<div class="text-body">{_esc(block.get("body", ""))}'
            f'</div>{_render_reading(block)}</div>')


def _render_note(block: dict) -> str:
    return f'<div class="note">{_esc(block.get("body", ""))}</div>'


def render_report(title: str, subtitle: str, sections: list[dict]) -> str:
    """Render structured sections into a full self-contained HTML page."""
    nav, body = [], []
    bar_count = 0
    for idx, section in enumerate(sections):
        if not isinstance(section, dict):
            continue
        sec_id = str(section.get("id") or f"sec-{idx}")
        sec_title = str(section.get("title") or sec_id)
        nav.append(f'<a href="#{_esc(sec_id)}" class="nav-link">'
                   f'{_esc(section.get("nav") or sec_title)}</a>')
        parts = [f'<section id="{_esc(sec_id)}"><h2>{_esc(sec_title)}</h2>']
        for block in section.get("blocks", []):
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "cards":
                parts.append(_render_cards(block))
            elif btype == "bars":
                parts.append(_render_bars(block, bar_count))
                bar_count += 1
            elif btype in ("columns", "months"):
                parts.append(_render_columns(block))
            elif btype == "table":
                parts.append(_render_table(block))
            elif btype == "text":
                parts.append(_render_text(block))
            elif btype == "note":
                parts.append(_render_note(block))
        parts.append("</section>")
        body.append("".join(parts))
    sub = f'<p class="subtitle">{_esc(subtitle)}</p>' if subtitle else ""
    return (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_esc(title)}</title><style>{_REPORT_CSS}</style></head><body>"
        '<div class="layout">'
        f'<nav class="sidebar"><div class="brand">📈 {_esc(title)}</div>{"".join(nav)}</nav>'
        f'<main class="content"><h1>{_esc(title)}</h1>{sub}{"".join(body)}</main>'
        "</div></body></html>"
    )


class PublishReportTool(Tool):
    """Render structured content into a rich report page and publish it."""

    def __init__(self, workspace: Path, public_url: str | None = None):
        self._reports_dir = Path(workspace) / "reports"
        self._public_url = (public_url or "").rstrip("/")

    @property
    def name(self) -> str:
        return "publish_report"

    @property
    def description(self) -> str:
        return (
            "Publica uma página de relatório/dashboard RICA e navegável a partir de conteúdo "
            "estruturado, para QUALQUER tipo de dado — resultados de query (SQL, Databricks), "
            "métricas de negócio, entregas de time, pesquisa, monitoramento, comparativos. A "
            "ferramenta renderiza o visual (menu lateral por seção, tema escuro profissional, "
            "cards de KPI, gráficos de barras e de colunas em CSS, tabelas); você só estrutura "
            "o conteúdo. PREFIRA-a ao publish_page sempre que a página for de dados. Decida as "
            "seções pelo conteúdo: visão geral primeiro; depois uma seção por dimensão que "
            "mereça aprofundamento (pessoa, produto, região, cluster, período... — o menu é "
            "gerado das seções); feche com síntese quando for análise. Todo bloco aceita "
            "'reading' — 1-2 frases interpretando o dado (use sempre em análises)."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Título do relatório."},
                "subtitle": {
                    "type": "string",
                    "description": "Contexto: fonte dos dados, período, data de geração.",
                },
                "sections": {
                    "type": "array",
                    "description": (
                        "Seções da página, na ordem. Cada uma vira uma entrada do menu "
                        "lateral. Formato: {id: âncora única (ex.: 'overview', 'vendas-sul'), "
                        "title: título da seção, nav: rótulo curto do menu (opcional), "
                        "blocks: lista de blocos}. Blocos: "
                        "{type:'cards', items:[{label, value}], reading?} — KPIs · "
                        "{type:'bars', title?, items:[{label, value, display?}], unit?, "
                        "reading?} — barras horizontais (rankings, distribuições) · "
                        "{type:'columns', title?, values:{'rótulo': número} ou "
                        "items:[{label, value}], reading?} — colunas verticais (séries "
                        "temporais como {'2026-01': 34}, ou categorias) · "
                        "{type:'table', title?, columns:[...], rows:[[...]], reading?} · "
                        "{type:'text', title?, body, reading?} · {type:'note', body}."
                    ),
                    "items": {"type": "object"},
                },
            },
            "required": ["title", "sections"],
        }

    async def execute(self, **kwargs: Any) -> str:
        title = str(kwargs.get("title", "")).strip() or "Relatório"
        subtitle = str(kwargs.get("subtitle", "") or "")
        sections = kwargs.get("sections")
        if not isinstance(sections, list) or not sections:
            return (
                "Error: 'sections' vazio. Envie a lista de seções com blocos "
                "(cards/bars/months/table/text/note)."
            )
        page = render_report(title, subtitle, sections)
        token = uuid.uuid4().hex
        self._reports_dir.mkdir(parents=True, exist_ok=True)
        (self._reports_dir / f"{token}.html").write_text(page, encoding="utf-8")
        link = f"{self._public_url}/r/{token}" if self._public_url else f"/r/{token}"
        return (
            f"Relatório publicado com {len(sections)} seções no menu.\n"
            f"Título: {title}\n"
            f"Link: {link}\n"
            f"Entregue ao usuário como link markdown, ex.: [Abrir relatório]({link})\n"
            f"O link é secreto: qualquer pessoa com o link consegue abrir."
        )
