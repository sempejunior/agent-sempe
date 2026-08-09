"""Testes da delegação a uma CLI de código, com um binário de mentira (sem rede)."""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from nanobot.agent.tools import code_agent as mod
from nanobot.agent.tools.code_agent import CliSpec, CodeAgentTool, CredentialKey
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
                keys=(CredentialKey("api_key", "FAKE_KEY"),), notes="exit 1 = falha geral"),
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


def _tool_with(agent_dir: Path, **extra) -> CodeAgentTool:
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
                         timeout=30, **extra)


@pytest.fixture
def tool(repo, fake_cli):
    agent_dir, _ = repo
    return _tool_with(agent_dir)


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


async def test_two_delegations_never_share_a_log_file(tool, repo):
    """Duas delegações no mesmo segundo davam o mesmo arquivo, aberto truncando:
    a segunda apagava o log da primeira e as duas relatavam a mesma saída."""
    agent_dir, local = repo
    await _on_branch(local)

    paths = {tool._log_path() for _ in range(50)}

    assert len(paths) == 50
    assert all(path.parent == agent_dir / "logs" for path in paths)


async def test_the_default_branch_is_refused(tool, repo):
    _, local = repo

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "branch protegido" in out
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
                keys=(CredentialKey("api_key", "FAKE_KEY"),), failure_markers=("Authentication failed",)),
    ))
    fake_cli.write_text(
        "#!/bin/sh\necho 'Authentication failed. Your API key may be invalid.'\nexit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "NÃO fez o trabalho" in out
    assert "terminou em" not in out


async def test_the_delegation_leaves_budget_for_the_rest_of_the_chain(tool):
    """Antes o teto era o mesmo da rotina: uma delegação consumia o orçamento todo."""
    solo = CodeAgentTool(user_id="u1", integration_repo=None, credential_repo=None,
                         agent_dir=tool._agent_dir, timeout=1800)

    assert solo._timeout < 1800
    assert solo._timeout >= 900


def test_the_prompt_carries_the_expected_result_and_how_to_verify():
    """O que determina a qualidade do código é o prompt ter essas partes."""
    prompt = CodeAgentTool._build_prompt(
        "lançamento retroativo é recusado", ["services/ponto/validacao.py"],
        expected="aceitar lançamento de até 30 dias",
        verify="pytest tests/test_ponto.py",
        constraints="não mexer nas migrações",
    )

    assert "## Problema" in prompt
    assert "aceitar lançamento de até 30 dias" in prompt
    assert "pytest tests/test_ponto.py" in prompt
    assert "não mexer nas migrações" in prompt
    assert "services/ponto/validacao.py" in prompt


def test_a_prompt_without_the_optional_fields_has_no_empty_sections():
    prompt = CodeAgentTool._build_prompt("corrige o valor", [])

    assert "## Problema" in prompt
    assert "## Resultado esperado" not in prompt
    assert "## Como verificar" not in prompt
    assert "NÃO faça push" in prompt
    assert "comite nesse branch" in prompt


async def test_a_quiet_failure_reverts_what_it_left_behind(tool, repo, fake_cli,
                                                           monkeypatch):
    """Autenticação falhou: nada de valor foi produzido, e o que sobrou mentiria."""
    _, local = repo
    await _on_branch(local)
    monkeypatch.setattr(mod, "CLI_SPECS", (
        CliSpec(integration="kiro", binary=str(fake_cli), args=(),
                keys=(CredentialKey("api_key", "FAKE_KEY"),), failure_markers=("Authentication failed",)),
    ))
    fake_cli.write_text(
        "#!/bin/sh\n"
        "echo 'lixo parcial' > app.py\n"
        "echo 'Authentication failed. Your API key may be invalid.'\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "NÃO fez o trabalho" in out
    assert "revertido" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"


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


async def test_a_cancelled_delegation_kills_the_whole_group(tool, repo, fake_cli):
    """Quem corta a tool é o registry, por fora, com cancelamento — não com timeout.

    Sem tratar isso, a CLI ficava órfã editando o repositório enquanto o
    orquestrador já tinha seguido para o commit.
    """
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\n"
        "echo 'comecei o trabalho'\n"
        "( sleep 2; echo 'valor = 99' > app.py ) &\n"
        "sleep 30\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    task = asyncio.create_task(tool.execute(repo=str(local), instruction="corrige"))
    await asyncio.sleep(0.5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    await asyncio.sleep(2.5)
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"


async def test_a_delegation_that_stops_to_ask_is_its_own_outcome(tool, repo, fake_cli):
    """A CLI roda sem poder perguntar; sem essa saída, decisão que falta vira chute."""
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\n"
        "mkdir -p .nanobot\n"
        "printf '{\"status\":\"blocked\",\"question\":\"o campo aceita nulo?\"}' "
        "> .nanobot/delegation.json\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "PAROU e devolveu uma pergunta" in out
    assert "o campo aceita nulo?" in out
    assert "NÃO abra PR" in out
    assert "terminou em" not in out


async def test_the_blocked_report_does_not_stay_in_the_working_tree(tool, repo,
                                                                   fake_cli):
    """O arquivo mora dentro do repo: deixado ali, entraria no commit."""
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\n"
        "mkdir -p .nanobot\n"
        "printf '{\"status\":\"blocked\",\"question\":\"qual regra?\"}' "
        "> .nanobot/delegation.json\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    await tool.execute(repo=str(local), instruction="corrige o valor")

    assert not (local / ".nanobot").exists()


async def test_a_blocked_delegation_reverts_the_half_done_tree(tool, repo, fake_cli):
    """Ela parou porque não sabia — o que sobrou não é correção, é ruído."""
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\n"
        "echo 'valor = 77' > app.py\n"
        "mkdir -p .nanobot\n"
        "printf '{\"status\":\"blocked\",\"question\":\"77 ou 99?\"}' "
        "> .nanobot/delegation.json\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "revertido" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"


async def test_a_report_without_the_blocked_status_is_not_a_question(tool, repo,
                                                                    fake_cli):
    _, local = repo
    await _on_branch(local)
    fake_cli.write_text(
        "#!/bin/sh\n"
        "echo 'valor = 2' > app.py\n"
        "mkdir -p .nanobot\n"
        "printf '{\"status\":\"done\"}' > .nanobot/delegation.json\n"
        "exit 0\n",
        encoding="utf-8",
    )
    fake_cli.chmod(0o755)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "terminou em" in out
    assert "PAROU" not in out


def test_the_prompt_sends_the_cli_to_the_house_rules_first():
    """Um patch que ignora as regras do repositório é retrabalho, mesmo funcionando."""
    prompt = CodeAgentTool._build_prompt("corrige o desconto", [], branch="fix/1")

    assert "AGENTS.md" in prompt
    assert "CLAUDE.md" in prompt
    assert "Antes de editar qualquer arquivo" in prompt


def test_the_prompt_tells_the_cli_to_ask_instead_of_guessing():
    prompt = CodeAgentTool._build_prompt("corrige o valor", [])

    assert ".nanobot/delegation.json" in prompt
    assert "NÃO adivinhe" in prompt


async def test_the_declared_ceiling_is_what_the_registry_will_honour(tool):
    """De nada adianta calcular o orçamento se o registry não souber dele."""
    assert tool.timeout_s == tool._timeout


async def test_without_a_job_runner_the_background_option_is_not_offered(tool):
    """Opção que não funciona no ambiente não deve aparecer para o modelo."""
    assert "background" not in tool.parameters["properties"]


async def test_background_hands_the_work_to_a_job_and_answers_at_once(repo, fake_cli):
    agent_dir, local = repo
    await _on_branch(local)
    runner = AsyncMock()
    runner.submit.return_value = "code_7f2a11"
    tool = _tool_with(agent_dir, job_runner=runner)

    assert "background" in tool.parameters["properties"]

    out = await tool.execute(repo=str(local), instruction="corrige o valor",
                             background=True)

    assert "code_7f2a11" in out
    assert "NÃO espere aqui" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"
    runner.submit.assert_awaited_once()
    kwargs = runner.submit.await_args.kwargs
    assert kwargs["kind"] == "code_agent"
    assert kwargs["timeout_s"] > tool._timeout


async def test_the_job_carries_the_origin_so_the_answer_comes_back(repo, fake_cli):
    agent_dir, local = repo
    await _on_branch(local)
    runner = AsyncMock()
    runner.submit.return_value = "code_1"
    tool = _tool_with(agent_dir, job_runner=runner)
    tool.set_origin(channel="web", chat_id="abc123", user_id="u1", agent_id="a1")

    await tool.execute(repo=str(local), instruction="corrige", background=True)

    kwargs = runner.submit.await_args.kwargs
    assert kwargs["origin_channel"] == "web"
    assert kwargs["origin_chat_id"] == "abc123"
    assert kwargs["agent_id"] == "a1"


async def test_the_work_the_job_runs_delegates_for_real(repo, fake_cli):
    """O que vai para o job tem de ser a delegação, não uma promessa vazia."""
    agent_dir, local = repo
    await _on_branch(local)
    runner = AsyncMock()
    runner.submit.return_value = "code_1"
    tool = _tool_with(agent_dir, job_runner=runner)

    await tool.execute(repo=str(local), instruction="corrige", background=True)

    work = runner.submit.await_args.kwargs["run"]
    out = await work("code_1")

    assert "terminou em" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 2\n"
    runner.attach_process.assert_awaited_once()
    assert runner.attach_process.await_args.kwargs["pid"] > 0


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


def test_the_managed_install_lives_on_the_mounted_workspace(tmp_path):
    """Instalar num diretório efêmero não resolveria nada: some no próximo deploy."""
    from nanobot.agent.tools.code_agent import get_cli_spec, managed_binary, managed_home

    spec = get_cli_spec("kiro")
    home = managed_home(tmp_path, "kiro")

    assert home == tmp_path / "tools" / "kiro"
    assert managed_binary(tmp_path, spec) == home / ".local" / "bin" / "kiro-cli"


def test_a_managed_binary_is_found_without_touching_path(tmp_path, monkeypatch):
    from nanobot.agent.tools.code_agent import (
        get_cli_spec,
        managed_binary,
        resolve_binary,
    )

    monkeypatch.setattr(mod, "_which", lambda binary: None)
    spec = get_cli_spec("kiro")
    assert resolve_binary(spec, tmp_path) is None

    binary = managed_binary(tmp_path, spec)
    binary.parent.mkdir(parents=True)
    binary.write_text("#!/bin/sh\n", encoding="utf-8")

    assert resolve_binary(spec, tmp_path) == str(binary)


def test_path_wins_over_the_managed_install(tmp_path, monkeypatch):
    """O operador pode sobrepor o que instalamos."""
    from nanobot.agent.tools.code_agent import get_cli_spec, resolve_binary

    monkeypatch.setattr(mod, "_which", lambda binary: "/usr/bin/kiro-cli")

    assert resolve_binary(get_cli_spec("kiro"), tmp_path) == "/usr/bin/kiro-cli"


async def test_install_reports_a_failed_download(tmp_path, monkeypatch):
    from nanobot.agent.tools.code_agent import CliSpec, InstallSpec, install_cli

    spec = CliSpec(integration="kiro", binary="nada", args=(), keys=(CredentialKey("api_key", "X"),),
                   install=InstallSpec(url="https://exemplo.invalido/x"))
    monkeypatch.setattr(mod, "_which", lambda binary: "/bin/true")

    ok, log = await install_cli(spec, tmp_path)

    assert ok is False
    assert "Falha ao baixar" in log


async def test_install_fails_when_the_binary_does_not_appear(tmp_path, monkeypatch):
    """O sucesso é o binário responder, não o instalador sair com 0."""
    from nanobot.agent.tools.code_agent import CliSpec, InstallSpec, install_cli

    spec = CliSpec(integration="kiro", binary="nunca-existe", args=(), keys=(CredentialKey("api_key", "X"),),
                   install=InstallSpec(url="file:///dev/null"))
    monkeypatch.setattr(mod, "_which", lambda binary: "/bin/true")

    async def fake_run(args, *, cwd, env):
        if args[0] == "curl":
            (cwd / "install.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        return True, "tudo certo, disse o instalador"

    monkeypatch.setattr(mod, "_run", fake_run)

    ok, log = await install_cli(spec, tmp_path)

    assert ok is False
    assert "binário não apareceu" in log


async def test_the_subscription_token_is_used_when_it_is_the_filled_field(repo,
                                                                         tmp_path,
                                                                         monkeypatch):
    """Assinatura e API key não são intercambiáveis: variável e flags diferem."""
    agent_dir, local = repo
    await _on_branch(local)
    script = tmp_path / "bin" / "claude-de-mentira"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text(
        "#!/bin/sh\necho \"args: $*\"\necho \"oauth: ${CLAUDE_CODE_OAUTH_TOKEN:-vazio}\"\n"
        "echo \"apikey: ${ANTHROPIC_API_KEY:-vazio}\"\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    monkeypatch.setattr(mod, "_which", lambda binary: str(script))
    monkeypatch.setattr(mod, "CLI_SPECS", (
        CliSpec(integration="claude_code", binary=str(script),
                args=("--print", "--model", "sonnet"),
                keys=(CredentialKey("oauth_token", "CLAUDE_CODE_OAUTH_TOKEN"),
                      CredentialKey("api_key", "ANTHROPIC_API_KEY", args=("--bare",)))),
    ))
    integration_repo = AsyncMock()
    integration_repo.get_integration.return_value = {
        "slug": "claude_code", "enabled": True, "credential_id": 1,
    }
    credential_repo = AsyncMock()
    credential_repo.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(json.dumps({"oauth_token": "tok-assinatura"})),
    }
    tool = CodeAgentTool(user_id="u1", integration_repo=integration_repo,
                         credential_repo=credential_repo, agent_dir=agent_dir,
                         timeout=30)

    out = await tool.execute(repo=str(local), instruction="corrige")

    assert "apikey: vazio" in out
    assert "--bare" not in out
    assert "--model sonnet" in out


async def test_the_api_key_path_adds_the_strict_auth_flag(repo, tmp_path, monkeypatch):
    """--bare lê a credencial só da variável — quebraria o token de assinatura."""
    agent_dir, local = repo
    await _on_branch(local)
    script = tmp_path / "bin" / "claude-de-mentira"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text("#!/bin/sh\necho \"args: $*\"\n", encoding="utf-8")
    script.chmod(0o755)
    monkeypatch.setattr(mod, "_which", lambda binary: str(script))
    monkeypatch.setattr(mod, "CLI_SPECS", (
        CliSpec(integration="claude_code", binary=str(script), args=("--print",),
                keys=(CredentialKey("oauth_token", "CLAUDE_CODE_OAUTH_TOKEN"),
                      CredentialKey("api_key", "ANTHROPIC_API_KEY", args=("--bare",)))),
    ))
    integration_repo = AsyncMock()
    integration_repo.get_integration.return_value = {
        "slug": "claude_code", "enabled": True, "credential_id": 1,
    }
    credential_repo = AsyncMock()
    credential_repo.get_credential.return_value = {
        "secret_cipher": crypto.encrypt(json.dumps({"api_key": "sk-ant-x"})),
    }
    tool = CodeAgentTool(user_id="u1", integration_repo=integration_repo,
                         credential_repo=credential_repo, agent_dir=agent_dir,
                         timeout=30)

    out = await tool.execute(repo=str(local), instruction="corrige")

    assert "--bare" in out


async def test_a_protected_branch_blocks_the_delegation(tool, repo):
    """A delegação agora comita — então 'não é branch protegido' virou pré-condição."""
    _, local = repo
    _git("checkout", "-q", "-B", "develop", cwd=local)

    out = await tool.execute(repo=str(local), instruction="corrige o valor")

    assert "branch protegido" in out
    assert (local / "app.py").read_text(encoding="utf-8") == "valor = 1\n"


def test_the_prompt_lets_it_commit_but_never_push_or_switch_branch():
    prompt = CodeAgentTool._build_prompt("corrige", [], branch="fix/41234")

    assert "fix/41234" in prompt
    assert "comite nesse branch" in prompt
    assert "NÃO faça push" in prompt
    assert "NÃO troque de branch" in prompt
    assert "main, master ou develop" in prompt


def test_the_claude_spec_pins_sonnet():
    """Decisão do fluxo, não do modelo: sempre Sonnet nessas delegações."""
    spec = mod.get_cli_spec("claude_code")

    assert spec is not None
    assert "--model" in spec.args
    assert spec.args[spec.args.index("--model") + 1] == "sonnet"
    assert "bypassPermissions" not in spec.args
