"""Testes do ExecTool: fronteira de segredo, confinamento e morte do grupo."""

import os
from pathlib import Path

import pytest

from nanobot.agent.tools.shell import ExecTool


@pytest.fixture
def root(tmp_path):
    (tmp_path / "sub").mkdir()
    return tmp_path


async def test_child_does_not_inherit_the_master_key(root, monkeypatch):
    monkeypatch.setenv("NANOBOT_SECRET_KEY", "chave-do-cofre")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-nao-vaze-isso")
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="env")

    assert "chave-do-cofre" not in out
    assert "sk-nao-vaze-isso" not in out
    assert "NANOBOT_SECRET_KEY" not in out


async def test_child_keeps_the_harmless_variables(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="echo $HOME; echo $PATH")

    assert os.environ["PATH"] in out


async def test_injected_env_reaches_the_child(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root,
                    env_extra={"MINHA_VAR": "valor-injetado"})

    out = await tool.execute(command="echo $MINHA_VAR")

    assert "valor-injetado" in out


async def test_working_dir_outside_the_root_is_rejected(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="ls", working_dir="/etc")

    assert "outside the allowed directory" in out


async def test_working_dir_traversal_is_rejected(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="ls", working_dir="../..")

    assert "outside the allowed directory" in out


async def test_relative_working_dir_resolves_under_the_root(root):
    (root / "sub" / "marcador.txt").write_text("ok", encoding="utf-8")
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="ls", working_dir="sub")

    assert "marcador.txt" in out


async def test_absolute_path_in_the_command_is_allowed(root):
    """O guard antigo bloqueava /usr/bin/... — era falso positivo puro."""
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="/usr/bin/env true")

    assert "blocked by safety guard" not in out
    assert "Exit code" not in out


async def test_dotdot_in_the_command_is_allowed(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="echo ../algum/caminho")

    assert "blocked by safety guard" not in out
    assert "../algum/caminho" in out


async def test_destructive_pattern_is_still_blocked(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="rm -rf /")

    assert "blocked by safety guard" in out


async def test_timeout_kills_the_child_process_group(root):
    """O filho do shell tem que morrer junto — antes ficava órfão."""
    marker = root / "vivo.txt"
    script = root / "longo.sh"
    script.write_text(f"sleep 30 && echo tarde > {marker}\n", encoding="utf-8")
    tool = ExecTool(working_dir=str(root), allowed_root=root, timeout=1)

    out = await tool.execute(command=f"sh {script} & wait")

    assert "timed out" in out
    assert not marker.exists()

    import asyncio
    await asyncio.sleep(2)
    assert not marker.exists(), "o filho sobreviveu ao timeout e escreveu depois"


async def test_missing_working_dir_is_reported(root):
    tool = ExecTool(working_dir=str(root), allowed_root=root)

    out = await tool.execute(command="ls", working_dir="nao-existe")

    assert "does not exist" in out


async def test_without_allowed_root_any_directory_works(tmp_path):
    """Modo CLI/filesystem: sem raiz declarada, não há confinamento."""
    tool = ExecTool(working_dir=str(tmp_path))

    out = await tool.execute(command="pwd", working_dir="/tmp")

    assert str(Path("/tmp").resolve()) in out
