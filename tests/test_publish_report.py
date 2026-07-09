"""Tests for the structured report renderer (publish_report)."""

from nanobot.agent.tools.report_page import PublishReportTool, render_report


def sample_sections():
    return [
        {
            "id": "overview",
            "title": "Visão do time",
            "nav": "📊 Visão",
            "blocks": [
                {"type": "cards", "items": [{"label": "Itens", "value": 352}]},
                {"type": "columns", "title": "Tendência",
                 "values": {"2026-01": 34, "2026-02": 40},
                 "reading": "Aceleração no início do ano."},
                {"type": "bars", "title": "Tipos",
                 "items": [{"label": "Bug", "value": 34}, {"label": "História", "value": 54}]},
                {"type": "table", "columns": ["Pessoa", "Itens"],
                 "rows": [["lucas.cid", 84]]},
            ],
        },
        {
            "id": "p-lucas-cid",
            "title": "lucas.cid",
            "blocks": [
                {"type": "text", "title": "Leitura",
                 "body": "Alto volume com <script> retrabalho."},
                {"type": "note", "body": "Dados parciais."},
            ],
        },
    ]


def test_render_report_structure():
    html = render_report("Killer 2026", "Azure DevOps · gerado hoje", sample_sections())
    assert '<a href="#overview" class="nav-link">📊 Visão</a>' in html
    assert '<a href="#p-lucas-cid" class="nav-link">lucas.cid</a>' in html
    assert '<section id="overview">' in html
    assert '<section id="p-lucas-cid">' in html
    assert "month-chart" in html
    assert "bar-fill" in html
    assert '<table class="rank">' in html
    assert 'class="reading"' in html
    assert "<style>" in html
    assert "<script" not in html.replace("&lt;script&gt;", "")


def test_render_report_escapes_content():
    html = render_report("Killer 2026", "", sample_sections())
    assert "&lt;script&gt;" in html


def test_columns_block_accepts_categories_and_months_alias():
    sections = [{
        "id": "s", "title": "S", "blocks": [
            {"type": "columns", "items": [
                {"label": "Databricks", "value": 12}, {"label": "Postgres", "value": 7}]},
            {"type": "months", "values": {"2026-03": 5}},
        ],
    }]
    html = render_report("Qualquer dado", "", sections)
    assert "Databricks" in html
    assert "Postgres" in html
    assert ">Mar<" in html
    assert html.count('class="month-chart"') == 2


async def test_publish_report_tool(tmp_path):
    tool = PublishReportTool(tmp_path, public_url="https://x.y")
    result = await tool.execute(title="T", sections=sample_sections())
    assert "https://x.y/r/" in result
    assert "2 seções" in result
    files = list((tmp_path / "reports").glob("*.html"))
    assert len(files) == 1
    assert "month-chart" in files[0].read_text()


async def test_publish_report_requires_sections(tmp_path):
    tool = PublishReportTool(tmp_path)
    result = await tool.execute(title="T", sections=[])
    assert result.startswith("Error")
