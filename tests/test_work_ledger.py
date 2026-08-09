"""Testes do registro de demandas trabalhadas: claim atômico e conclusão com PR."""

from datetime import datetime, timedelta

import pytest_asyncio

from nanobot.agent.tools.work_ledger import WorkLedgerTool


@pytest_asyncio.fixture
async def ledger(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    return repos.work_items


@pytest_asyncio.fixture
async def tool(ledger):
    return WorkLedgerTool(user_id="u1", work_item_repo=ledger, agent_id="a1")


async def test_the_first_claim_wins(ledger):
    result = await ledger.claim("u1", source="azure", external_id="41234",
                                title="Erro no ponto")

    assert result["claimed"] is True
    assert result["state"] == "claimed"
    assert result["title"] == "Erro no ponto"


async def test_a_second_claim_while_the_first_works_is_refused(ledger):
    """O semáforo do cron permite duas execuções: não podem pegar o mesmo item."""
    await ledger.claim("u1", source="azure", external_id="41234")

    result = await ledger.claim("u1", source="azure", external_id="41234")

    assert result["claimed"] is False
    assert "trabalhando" in result["reason"]


async def test_a_finished_item_is_never_claimed_again(ledger):
    """É o teste que prova que a rotina não abre um segundo PR amanhã."""
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.link_repo("u1", source="azure", external_id="41234",
                           repo="grupo/api", branch="fix/41234")
    await ledger.complete_repo("u1", source="azure", external_id="41234",
                               repo="grupo/api", pr_url="https://gitlab/mr/7")

    result = await ledger.claim("u1", source="azure", external_id="41234")

    assert result["claimed"] is False
    assert "done" in result["reason"]
    assert result["pr_urls"] == ["https://gitlab/mr/7"]


async def test_completing_without_a_pr_is_refused(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.link_repo("u1", source="azure", external_id="41234",
                           repo="grupo/api", branch="fix/41234")

    result = await ledger.complete_repo("u1", source="azure", external_id="41234",
                                        repo="grupo/api", pr_url="  ")

    assert result["recorded"] is False
    row = await ledger.get("u1", source="azure", external_id="41234")
    assert row["state"] == "claimed"


async def test_a_demand_with_two_repositories_needs_two_prs(ledger):
    """A 41235 pedia backend e frontend; fechar no primeiro PR era mentira."""
    await ledger.claim("u1", source="azure", external_id="41235")
    await ledger.link_repo("u1", source="azure", external_id="41235",
                           repo="grupo/api", branch="feat/41235-faq")
    await ledger.link_repo("u1", source="azure", external_id="41235",
                           repo="grupo/front", branch="feat/41235-faq")

    first = await ledger.complete_repo("u1", source="azure", external_id="41235",
                                       repo="grupo/api", pr_url="https://gitlab/mr/1")

    assert first["closed"] is False
    row = await ledger.get("u1", source="azure", external_id="41235")
    assert row["state"] == "claimed"

    second = await ledger.complete_repo("u1", source="azure", external_id="41235",
                                        repo="grupo/front", pr_url="https://gitlab/mr/2")

    assert second["closed"] is True
    row = await ledger.get("u1", source="azure", external_id="41235")
    assert row["state"] == "done"


async def test_a_repository_gets_one_branch_per_demand(ledger):
    """A regra virou índice único: não é mais só uma frase no prompt."""
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.link_repo("u1", source="azure", external_id="41234",
                           repo="grupo/api", branch="fix/41234")

    again = await ledger.link_repo("u1", source="azure", external_id="41234",
                                   repo="grupo/api", branch="fix/41234-outro")

    assert again["linked"] is False
    rows = await ledger.list_repos("u1", source="azure", external_id="41234")
    assert [r["branch"] for r in rows] == ["fix/41234"]


async def test_completing_a_repository_nobody_declared_is_refused(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")

    result = await ledger.complete_repo("u1", source="azure", external_id="41234",
                                        repo="grupo/api", pr_url="https://gitlab/mr/7")

    assert result["recorded"] is False
    assert "não declarado" in result["reason"]


async def test_a_failed_item_can_be_retried(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")
    await ledger.fail("u1", source="azure", external_id="41234", note="teste vermelho")

    result = await ledger.claim("u1", source="azure", external_id="41234")

    assert result["claimed"] is True
    assert result["attempts"] == 2
    assert "falhou" in result["reason"]


async def test_a_stale_claim_is_taken_over(ledger):
    """Uma execução morta no timeout não pode bloquear o item para sempre."""
    await ledger.claim("u1", source="azure", external_id="41234")
    old = (datetime.now() - timedelta(hours=3)).isoformat()
    await ledger._db.execute(
        "UPDATE work_items SET claimed_at = ? WHERE external_id = '41234'", (old,))
    await ledger._db.commit()

    result = await ledger.claim("u1", source="azure", external_id="41234",
                               stale_after_s=3600)

    assert result["claimed"] is True
    assert "expirou" in result["reason"]


async def test_the_ledger_is_isolated_between_users(ledger, repos):
    await repos.users.create({"user_id": "u2", "display_name": "u2"})
    await ledger.claim("u1", source="azure", external_id="41234")

    result = await ledger.claim("u2", source="azure", external_id="41234")

    assert result["claimed"] is True
    assert await ledger.get("u2", source="azure", external_id="41234") is not None


async def test_the_same_id_in_two_trackers_is_two_items(ledger):
    await ledger.claim("u1", source="azure", external_id="41234")

    result = await ledger.claim("u1", source="jira", external_id="41234")

    assert result["claimed"] is True


async def test_the_tool_tells_the_agent_to_skip(tool):
    await tool.execute(action="claim", source="azure", external_id="41234")
    await tool.execute(action="link", source="azure", external_id="41234",
                       repo="grupo/api", branch="fix/41234")
    await tool.execute(action="complete", source="azure", external_id="41234",
                       repo="grupo/api", pr_url="https://gitlab/mr/7")

    out = await tool.execute(action="claim", source="azure", external_id="41234")

    assert "PULE" in out
    assert "https://gitlab/mr/7" in out


async def test_the_tool_refuses_to_complete_without_a_pr(tool):
    await tool.execute(action="claim", source="azure", external_id="41234")
    await tool.execute(action="link", source="azure", external_id="41234",
                       repo="grupo/api", branch="fix/41234")

    out = await tool.execute(action="complete", source="azure", external_id="41234",
                             repo="grupo/api")

    assert "obrigatória" in out
    assert "fail" in out


async def test_the_tool_refuses_to_complete_without_a_repo(tool):
    """O PR é de um repositório: sem dizer qual, a demanda fecharia errado."""
    await tool.execute(action="claim", source="azure", external_id="41234")

    out = await tool.execute(action="complete", source="azure", external_id="41234",
                             pr_url="https://gitlab/mr/7")

    assert "repo é obrigatório" in out


async def test_the_tool_sends_the_agent_to_link_before_completing(tool):
    await tool.execute(action="claim", source="azure", external_id="41234")

    out = await tool.execute(action="complete", source="azure", external_id="41234",
                             repo="grupo/api", pr_url="https://gitlab/mr/7")

    assert "link" in out


async def test_the_tool_reports_what_is_still_missing(tool):
    await tool.execute(action="claim", source="azure", external_id="41235")
    await tool.execute(action="link", source="azure", external_id="41235",
                       repo="grupo/api", branch="feat/41235-faq")
    await tool.execute(action="link", source="azure", external_id="41235",
                       repo="grupo/front", branch="feat/41235-faq")

    out = await tool.execute(action="complete", source="azure", external_id="41235",
                             repo="grupo/api", pr_url="https://gitlab/mr/1")

    assert "1/2" in out
    assert "grupo/front" in out


async def test_the_tool_refuses_to_complete_an_unclaimed_item(tool):
    out = await tool.execute(action="complete", source="azure", external_id="99999",
                             repo="grupo/api", pr_url="https://gitlab/mr/9")

    assert "não está no registro" in out


async def test_the_tool_refuses_to_link_without_a_branch(tool):
    await tool.execute(action="claim", source="azure", external_id="41234")

    out = await tool.execute(action="link", source="azure", external_id="41234",
                             repo="grupo/api")

    assert "precisa de repo e branch" in out


async def test_the_tool_requires_a_reason_to_fail(tool):
    await tool.execute(action="claim", source="azure", external_id="41234")

    out = await tool.execute(action="fail", source="azure", external_id="41234")

    assert "note é obrigatória" in out


async def test_the_tool_lists_what_was_done(tool):
    await tool.execute(action="claim", source="azure", external_id="41234",
                       title="Erro no ponto")
    await tool.execute(action="link", source="azure", external_id="41234",
                       repo="grupo/api", branch="fix/41234")
    await tool.execute(action="complete", source="azure", external_id="41234",
                       repo="grupo/api", pr_url="https://gitlab/mr/7")

    out = await tool.execute(action="list")

    assert "azure#41234" in out
    assert "done" in out
    assert "grupo/api" in out
    assert "https://gitlab/mr/7" in out


async def test_an_unknown_action_is_refused(tool):
    out = await tool.execute(action="merge", source="azure", external_id="1")

    assert "action deve ser" in out


async def test_the_tool_needs_source_and_id(tool):
    out = await tool.execute(action="claim", source="azure")

    assert "obrigatórios" in out


def test_the_catalog_exposes_the_ledger_as_infrastructure():
    """Registrar o que já foi feito não tem consequência fora do agente."""
    from nanobot.agent.tools.catalog import get_spec

    spec = get_spec("work_ledger")

    assert spec is not None
    assert spec.permission is False
    assert spec.requires == ("work_items",)


def test_the_ledger_tool_is_absent_without_its_repository():
    from pathlib import Path

    from nanobot.agent.tools.catalog import ToolContext, get_spec

    ctx = ToolContext(workspace=Path("/tmp"), user_id="u1", agent_id="a1")

    assert get_spec("work_ledger").is_available(ctx) is False
