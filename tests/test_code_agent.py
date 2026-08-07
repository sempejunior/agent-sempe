"""Testes da delegação a uma CLI de código, com um binário de mentira (sem rede)."""

import json
import os
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from nanobot.agent.tools import code_agent as mod
from nanobot.agent.tools.code_agent import CliSpec, CodeAgentTool
from nanobot.utils import crypto

_SECRET = "ksk-chave-secreta-do-kiro"


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture(autouse=True)
def master_key(tmp_path):
    crypto.ensure_master_key(tmp_path)


@pytest.fixture
def fake_cli(tmp_path, monkeypatch):
    """Um binário de mentira que edita um arquivo, fala muito e sai como pedido."""
    script = tmp_path / "bin" / "cli-de-mentira"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text(
        "#!/bin/sh\n"
        "i=0; while [ $i -lt 400 ]; do echo \"linha de ruido $i\"; i=$((i+1)); done\n"
        "echo \"chave vista: $FAKE_KEY\"\n"
        "echo 'valor = 2' > app.py\n"
        "echo 'RESUMO FINAL DO AGENTE'\n"
        "exit ${FAKE_EXIT:-0}\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    monkeypatch.setattr(mod, "_which", lambda binary: str(script))
    monkeypatch.setattr(mod, "CLI_SPECS", (
        CliSpec(integration="kiro", binary=str(script), args=("--headless",),
                key_env="FAKE_KEY", notes="exit 1 = falha geral"),
    ))
    return script


@pytest.fixture
def repo(tmp_path):
    """Repositório clonado, num branch de trabalho, dentro do diretório do agente."""
    origin = tmp_path / "origin.git"
    work = tmp_path / "seed"
    work.mkdir()
    _git("init", "-q", "-b", "main", ".", cwd=work)
    _git("config", "user.email", "t@t.local", cwd=work)
    _git("config", "user.name", "T", cwd=work)
    (work / "app.py").write_text("valor = 1\n", encoding="utf-8")
    _git("add", ".", cwd=work)
    _git("commit", "-qm", "inicial", cwd=work)
    _git("clone", "-q", "--bare", str(work), str(origin), cwd=tmp_path)

    agent_dir = tmp_path / "agent"
    local = agent_dir / "repos" / "kiro" / "app"
    local.parent.mkdir(parents=True)
    _git("clone", "-q", str(origin), str(local), cwd=local.parent)
    _git("config", "user.email", "bot@local", cwd=local)
    _git("config", "user.name", "Bot", cwd=local)
    return agent_dir, local


@pytest.fixture
def tool(repo, fake_cli):
    agent_dir, _ = repo
    integration_repo = AsyncMock()
    integration_repo.get_integration.return_value = {
        "slug": "kiro", "enabled": True, "credential_id": 1,
    }
    credential_repo = AsyncMock()
    credential_repo.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(json.dumps({"api_key": _SECRET})),
    }
    return CodeAgentTool(user_id="u1", integration_repo=integration_repo,
                         credential_repo=credential_repo, agent_dir=agent_dir,
                         timeout=30)


async def _on_branch(local: Path, name: str = "fix/valor"):
    _git("checkout", "-q", "-B", name, cwd=local)


async def test_delegation_edits_the_repository(tool, repo):
    _, local = repo
    await _on_branch(local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "terminou em" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 2\n"


async def test_the_report_shows_what_changed(tool, repo):
    _, local = repo
    await _on_branch(local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "app.py" in out
    assert "Branch de trabalho: fix/valor" in out


async def test_the_secret_is_scrubbed_from_the_report(tool, repo):
    """A CLI roda com confiança de shell — ela pode imprimir o próprio ambiente."""
    _, local = repo
    await _on_branch(local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert _SECRET not in out
    assert "***" in out


async def test_the_report_keeps_the_tail_not_the_head(tool, repo):
    """O resumo de uma CLI de agente está no fim da saída."""
    _, local = repo
    await _on_branch(local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "RESUMO FINAL DO AGENTE" in out
    assert "linha de ruido 0\n" not in out


async def test_the_full_log_is_kept_on_disk(tool, repo):
    agent_dir, local = repo
    await _on_branch(local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    logs = list((agent_dir / "logs").glob("code-agent-*.log"))
    assert len(logs) == 1
    assert "linha de ruido 0" in logs[0].read_text(encoding="utf-8")
    assert str(logs[0]) in out


async def test_the_default_branch_is_refused(tool, repo):
    _, local = repo

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "branch default" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"


async def test_a_failing_cli_is_reported_with_its_exit_code(tool, repo, fake_cli):
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text("#!/bin/sh\necho 'nao consegui'\nexit 1\n", encoding="utf-8")
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "falhou (exit 1)" in out
    assert "falha geral" in out


async def test_the_child_env_is_an_allowlist_plus_the_key(tool, repo, fake_cli):
    """Nada do ambiente do gateway atravessa, exceto o essencial e a chave."""
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text("#!/bin/sh\nenv | sort\n", encoding="utf-8")
    fake_cli.chmod(0o755)
    os.environ["NANOBOT_SECRET_KEY_CANARIO"] = "nao-deveria-passar"

    out = await tool.execute(repo=str(local), instruction="lista o ambiente")

    assert "NANOBOT_SECRET_KEY_CANARIO" not in out
    assert "FAKE_KEY=***" in out


async def test_a_quiet_auth_failure_is_not_reported_as_success(tool, repo, fake_cli,
                                                              monkeypatch):
    """kiro-cli 2.16.2 sai com 0 quando a autenticação falha — o exit code mente."""
    _, local = repo
    await _on_branch(local)
    monkeypatch.setattr(mod, "CLI_SPECS", (
        CliSpec(integration="kiro", binary=str(fake_cli), args=(),
                key_env="FAKE_KEY", failure_markers=("Authentication failed",)),
    ))
    fake_cli.write_text(
        "#!/bin/sh\necho 'Authentication failed. Your API key may be invalid.'\nexit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "NÃO fez o trabalho" in out
    assert "terminou em" not in out


async def test_a_timeout_still_reports_what_was_done(tool, repo, fake_cli):
    """Diferente do exec, que descarta a saída acumulada no estouro."""
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\necho 'comecei o trabalho'\necho 'valor = 2' > app.py\nsleep 30\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)
    tool._timeout = 1

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "interrompido" in out
    assert "comecei o trabalho" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 2\n"


async def test_a_repo_outside_the_agent_directory_is_refused(tool):
    out = await tool.execute(repo="/etc", instruction="faz algo")

    assert "está fora de" in out


async def test_an_empty_instruction_is_refused(tool, repo):
    _, local = repo

    out = await tool.execute(repo=str(local), instruction="   ")

    assert "instruction é obrigatória" in out


async def test_an_inactive_integration_is_explained(tool, repo):
    _, local = repo
    await _on_branch(local)
    tool._integration_repo.get_integration.return_value = None

    out = await tool.execute(repo=str(local), instruction="corrige")

    assert "nenhum agente de código ativo" in out


async def test_a_missing_binary_is_explained(tool, repo, monkeypatch):
    _, local = repo
    await _on_branch(local)
    monkeypatch.setattr(mod, "_which", lambda binary: None)

    out = await tool.execute(repo=str(local), instruction="corrige")

    assert "binário não está instalado" in out


def test_the_catalog_derives_the_cli_integrations():
    from nanobot.agent.tools.catalog import get_spec
    from nanobot.agent.tools.code_agent import cli_integrations

    assert set(get_spec("code_agent").integrations) == set(cli_integrations())
    assert "kiro" in cli_integrations()
