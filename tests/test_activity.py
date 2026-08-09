"""Testes da atividade: os quatro registros viram uma linha do tempo só."""

import pytest_asyncio

from nanobot.activity.service import build_activity


@pytest_asyncio.fixture
async def user(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    return "u1"


async def test_an_empty_account_has_three_empty_buckets(repos, user):
    activity = await build_activity(repos, user)

    assert activity == {"waiting": [], "running": [], "delivered": []}


async def test_an_open_question_waits_and_carries_its_subject(repos, user):
    await repos.questions.ask(
        user, question="O campo aceita nulo?", subject="Bug #41234",
        subject_url="https://azure/41234", subject_ref="azure#41234",
    )

    activity = await build_activity(repos, user)

    assert len(activity["waiting"]) == 1
    entry = activity["waiting"][0]
    assert entry["kind"] == "question"
    assert entry["title"] == "O campo aceita nulo?"
    assert entry["links"] == [{"label": "Bug #41234", "url": "https://azure/41234"}]
    assert entry["question"]["state"] == "open"
    assert activity["delivered"] == []


async def test_an_answered_question_moves_to_delivered(repos, user):
    row = await repos.questions.ask(user, question="O campo aceita nulo?")
    await repos.questions.answer(user, row["id"], answer="aceita", answered_by="human")

    activity = await build_activity(repos, user)

    assert activity["waiting"] == []
    entry = next(e for e in activity["delivered"] if e["kind"] == "answer")
    assert "Você respondeu: aceita" in entry["detail"]


async def test_a_running_job_can_be_cancelled_from_the_screen(repos, user):
    await repos.jobs.create(user, job_id="code_abc", kind="code_agent",
                            label="Delegação no backend")
    await repos.jobs.start(user, "code_abc")

    activity = await build_activity(repos, user)

    assert len(activity["running"]) == 1
    assert activity["running"][0]["job_id"] == "code_abc"
    assert activity["delivered"] == []


async def test_a_finished_job_reports_its_outcome(repos, user):
    await repos.jobs.create(user, job_id="code_abc", kind="code_agent",
                            label="Delegação no backend")
    await repos.jobs.finish(user, "code_abc", state="done", result="2 arquivos")

    activity = await build_activity(repos, user)

    assert activity["running"] == []
    entry = next(e for e in activity["delivered"] if e["kind"] == "job")
    assert "Concluída" in entry["detail"]
    assert "2 arquivos" in entry["detail"]


async def test_each_repository_of_a_demand_is_its_own_delivery(repos, user):
    """Uma demanda de dois repositórios são duas entregas, com dois links."""
    await repos.work_items.claim(user, source="azure", external_id="41235",
                                 title="FAQ de onboarding")
    for repo, url in (("grupo/api", "https://gitlab/mr/1"),
                      ("grupo/front", "https://gitlab/mr/2")):
        await repos.work_items.link_repo(user, source="azure", external_id="41235",
                                         repo=repo, branch="feat/41235-faq")
        await repos.work_items.complete_repo(user, source="azure",
                                             external_id="41235", repo=repo,
                                             pr_url=url)

    activity = await build_activity(repos, user)

    demands = [e for e in activity["delivered"] if e["kind"] == "demand"]
    assert len(demands) == 2
    assert {link["url"] for e in demands for link in e["links"]} == {
        "https://gitlab/mr/1", "https://gitlab/mr/2",
    }


async def test_a_repository_without_a_pr_is_not_a_delivery(repos, user):
    await repos.work_items.claim(user, source="azure", external_id="41235")
    await repos.work_items.link_repo(user, source="azure", external_id="41235",
                                     repo="grupo/api", branch="feat/41235-faq")

    activity = await build_activity(repos, user)

    assert [e for e in activity["delivered"] if e["kind"] == "demand"] == []


async def test_a_published_page_survives_the_conversation(repos, user):
    """O link só existia no chat que o gerou; fechar o chat perdia a entrega."""
    await repos.deliverables.record(user, kind="report", title="Relatório do time",
                                    url="/r/abc123", token="abc123")

    activity = await build_activity(repos, user)

    entry = next(e for e in activity["delivered"] if e["kind"] == "page")
    assert entry["title"] == "Relatório do time"
    assert entry["links"] == [{"label": "Abrir", "url": "/r/abc123"}]


async def test_a_pendency_points_back_at_the_conversation(repos, user):
    """Sem isso, o alerta diz que algo aconteceu e não diz onde."""
    await repos.questions.ask(user, question="O campo aceita nulo?",
                              origin_channel="web", origin_chat_id="abc123")

    activity = await build_activity(repos, user)

    assert activity["waiting"][0]["session_key"] == "web:abc123"


async def test_a_demand_points_back_at_where_it_was_picked_up(repos, user):
    await repos.work_items.claim(user, source="azure", external_id="41235",
                                 origin_channel="web", origin_chat_id="abc123")
    await repos.work_items.link_repo(user, source="azure", external_id="41235",
                                     repo="grupo/api", branch="feat/41235")
    await repos.work_items.complete_repo(user, source="azure", external_id="41235",
                                         repo="grupo/api", pr_url="https://gitlab/mr/1")

    activity = await build_activity(repos, user)

    demand = next(e for e in activity["delivered"] if e["kind"] == "demand")
    assert demand["session_key"] == "web:abc123"


async def test_a_published_page_points_back_at_the_conversation(repos, user):
    await repos.deliverables.record(user, kind="report", title="Relatório",
                                    url="/r/abc", token="abc",
                                    origin_channel="web", origin_chat_id="abc123")

    activity = await build_activity(repos, user)

    page = next(e for e in activity["delivered"] if e["kind"] == "page")
    assert page["session_key"] == "web:abc123"


async def test_work_with_no_conversation_offers_none(repos, user):
    """Uma varredura de madrugada não tem conversa: a tela não pode oferecer uma."""
    await repos.deliverables.record(user, kind="report", title="Relatório da rotina",
                                    url="/r/xyz", token="xyz")

    activity = await build_activity(repos, user)

    page = next(e for e in activity["delivered"] if e["kind"] == "page")
    assert page["session_key"] == ""


async def test_recording_the_same_page_twice_is_one_delivery(repos, user):
    for _ in range(2):
        await repos.deliverables.record(user, kind="page", title="Painel",
                                        url="/r/abc123", token="abc123")

    activity = await build_activity(repos, user)

    assert len([e for e in activity["delivered"] if e["kind"] == "page"]) == 1
