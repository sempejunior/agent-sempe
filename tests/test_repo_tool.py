"""Testes da tool repo contra um repositório bare local (sem rede)."""

import json
import subprocess
from unittest.mock import AsyncMock

import pytest

from nanobot.agent.tools.repo import RepoTool
from nanobot.integrations.catalog import GitSpec, IntegrationEntry
from nanobot.utils import crypto

_SECRET = "token-super-secreto"


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture(autouse=True)
def master_key(tmp_path):
    crypto.ensure_master_key(tmp_path)


@pytest.fixture
def origin(tmp_path):
    """Um bare repo com um commit em 'main', servindo de origem."""
    work = tmp_path / "work"
    work.mkdir()
    _git("init", "-b", "main", cwd=work)
    _git("config", "user.email", "t@t.local", cwd=work)
    _git("config", "user.name", "Teste", cwd=work)
    (work / "app.py").write_text("valor = 1\n", encoding="utf-8")
    _git("add", ".", cwd=work)
    _git("commit", "-m", "inicial", cwd=work)

    bare = tmp_path / "origin.git"
    _git("clone", "--bare", str(work), str(bare), cwd=tmp_path)
    return bare


@pytest.fixture
def tool(tmp_path, origin, monkeypatch):
    entry = IntegrationEntry(
        id="forge", kind="api", name="Forge", description="", category="devtools",
        git=GitSpec("{base_url}/{path}", "", "token"),
    )
    monkeypatch.setattr("nanobot.agent.tools.repo.get_integration",
                        lambda slug: entry if slug == "forge" else None)

    integration_repo = AsyncMock()
    integration_repo.get_integration.return_value = {
        "slug": "forge", "credential_id": 1, "enabled": True,
    }
    credential_repo = AsyncMock()
    credential_repo.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(json.dumps({
            "base_url": f"file://{origin.parent}", "token": _SECRET,
        })),
    }
    return RepoTool(user_id="u1", integration_repo=integration_repo,
                    credential_repo=credential_repo, agent_dir=tmp_path / "agent")


async def _ensure(tool):
    out = await tool.execute(action="ensure", origin="forge", path="origin.git")
    assert not out.startswith("Error"), out
    return json.loads(out)


async def test_ensure_clones_and_reports_the_default_branch(tool):
    info = await _ensure(tool)

    assert info["cloned_now"] is True
    assert info["default_branch"] == "main"
    assert info["head"]


async def test_ensure_is_idempotent(tool):
    first = await _ensure(tool)
    second = await _ensure(tool)

    assert second["cloned_now"] is False
    assert second["repo"] == first["repo"]


async def test_the_secret_never_reaches_disk_or_output(tool):
    out = await tool.execute(action="ensure", origin="forge", path="origin.git")
    info = json.loads(out)
    config = (pytest.importorskip("pathlib").Path(info["repo"]) / ".git" / "config")

    assert _SECRET not in out
    assert _SECRET not in config.read_text(encoding="utf-8")


async def test_commit_on_the_default_branch_is_refused(tool):
    info = await _ensure(tool)
    from pathlib import Path
    (Path(info["repo"]) / "app.py").write_text("valor = 2\n", encoding="utf-8")

    out = await tool.execute(action="commit", repo=info["repo"], message="tenta")

    assert "branch default" in out


async def test_push_on_the_default_branch_is_refused(tool):
    info = await _ensure(tool)

    out = await tool.execute(action="push", repo=info["repo"])

    assert "branch default" in out


async def test_branch_refuses_the_default_name(tool):
    info = await _ensure(tool)

    out = await tool.execute(action="branch", repo=info["repo"], name="main")

    assert "branch default" in out


async def test_the_full_cycle_branch_commit_push(tool, origin):
    info = await _ensure(tool)
    from pathlib import Path
    repo = Path(info["repo"])

    created = await tool.execute(action="branch", repo=str(repo), name="fix/valor")
    assert "criado" in created

    (repo / "app.py").write_text("valor = 2\n", encoding="utf-8")
    committed = await tool.execute(action="commit", repo=str(repo),
                                   message="corrige o valor")
    assert "Commit" in committed

    pushed = await tool.execute(action="push", repo=str(repo))
    assert "enviado" in pushed

    branches = subprocess.run(["git", "branch", "--list", "fix/valor"], cwd=origin,
                              capture_output=True, text=True, check=True)
    assert "fix/valor" in branches.stdout


async def test_commit_with_a_clean_tree_is_refused(tool):
    info = await _ensure(tool)
    await tool.execute(action="branch", repo=info["repo"], name="fix/vazio")

    out = await tool.execute(action="commit", repo=info["repo"], message="nada")

    assert "árvore está limpa" in out


async def test_diff_shows_the_change(tool):
    info = await _ensure(tool)
    from pathlib import Path
    (Path(info["repo"]) / "app.py").write_text("valor = 99\n", encoding="utf-8")

    out = await tool.execute(action="diff", repo=info["repo"])

    assert "valor = 99" in out


async def test_repo_outside_the_agent_directory_is_refused(tool):
    out = await tool.execute(action="status", repo="/etc")

    assert "fora de" in out


async def test_unknown_origin_lists_the_available_ones(tool):
    out = await tool.execute(action="ensure", origin="bitbucket", path="x/y")

    assert "não tem repositório declarado" in out


async def test_invalid_action_is_reported(tool):
    out = await tool.execute(action="merge")

    assert "ação inválida" in out
