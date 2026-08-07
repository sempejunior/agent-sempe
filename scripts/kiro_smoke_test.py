"""Prova que a delegação ao Kiro funciona, num repositório de mentira.

Exercita a cadeia inteira da tool `code_agent` — integração ativa, credencial
decifrada, binário resolvido, processo executado, diff conferido — sem tocar em
nenhum repositório real e sem gastar uma demanda de verdade.

Roda dentro do container:

    docker cp scripts/kiro_smoke_test.py nanobot-gateway:/tmp/
    docker exec nanobot-gateway python /tmp/kiro_smoke_test.py <user_id>

Sai com 0 quando o Kiro escreveu o código pedido, e explica o que faltou quando
não. Nunca imprime a chave.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
import tempfile
from pathlib import Path

DATA_DIR = Path("/root/.nanobot")
_TASK = (
    "O arquivo soma.py tem uma função soma(a, b) que devolve a - b, o que está "
    "errado. Corrija para devolver a soma."
)


def _git(*args: str, cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _seed_repo(agent_dir: Path) -> Path:
    """Um repositório clonado, num branch de trabalho, onde a tool aceita mexer."""
    origin = agent_dir / "repos" / "kiro" / "_smoke_origin"
    local = agent_dir / "repos" / "kiro" / "_smoke_test"
    for path in (origin, local):
        subprocess.run(["rm", "-rf", str(path)], check=False)
    origin.parent.mkdir(parents=True, exist_ok=True)

    seed = Path(tempfile.mkdtemp())
    _git("init", "-q", "-b", "main", ".", cwd=seed)
    _git("config", "user.email", "smoke@local", cwd=seed)
    _git("config", "user.name", "Smoke", cwd=seed)
    (seed / "soma.py").write_text("def soma(a, b):\n    return a - b\n", encoding="utf-8")
    (seed / "test_soma.py").write_text(
        "from soma import soma\n\n\ndef test_soma():\n    assert soma(2, 3) == 5\n",
        encoding="utf-8",
    )
    _git("add", ".", cwd=seed)
    _git("commit", "-qm", "inicial", cwd=seed)
    _git("clone", "-q", "--bare", str(seed), str(origin), cwd=seed)
    _git("clone", "-q", str(origin), str(local), cwd=origin.parent)
    _git("config", "user.email", "smoke@local", cwd=local)
    _git("config", "user.name", "Smoke", cwd=local)
    _git("checkout", "-q", "-B", "fix/smoke", cwd=local)
    return local


async def main() -> int:
    user_id = sys.argv[1] if len(sys.argv) > 1 else ""
    if not user_id:
        print("uso: kiro_smoke_test.py <user_id>")
        return 2

    from nanobot.agent.tools.code_agent import CLI_SPECS, CodeAgentTool, resolve_binary
    from nanobot.db.factory import create_sqlite_factory
    from nanobot.db.sqlite.connection import create_database
    from nanobot.utils import crypto
    from nanobot.utils.helpers import agent_workspace_path

    crypto.ensure_master_key(DATA_DIR)
    workspace = DATA_DIR / "workspace"

    print("1) binário do Kiro nesta máquina")
    for spec in CLI_SPECS:
        found = resolve_binary(spec, workspace)
        print(f"   {spec.binary}: {found or 'NÃO ENCONTRADO'}")
        if not found:
            print("   → instale pela UI (Integrações → Kiro → Instalar) ou suba a "
                  "imagem com KIRO_CLI=1.")
            return 1

    db = await create_database(str(DATA_DIR / "nanobot.db"))
    repos = create_sqlite_factory(db)

    print("2) integração kiro ativa para o usuário")
    row = await repos.integrations.get_integration(user_id, "kiro")
    if not row or not row.get("enabled"):
        print("   → NÃO está ativa. Integrações → Kiro → Ativar, escolhendo a "
              "credencial com a chave ksk_.")
        await db.close()
        return 1
    if not row.get("credential_id"):
        print("   → ativa, mas sem credencial vinculada.")
        await db.close()
        return 1
    print(f"   ativa, credencial #{row['credential_id']}")

    agents = await repos.agents.list_agents(user_id)
    agent_id = next((a["agent_id"] for a in agents), None)
    if not agent_id:
        print("   → usuário sem agentes.")
        await db.close()
        return 1
    agent_dir = agent_workspace_path(workspace, user_id, agent_id)
    agent_dir.mkdir(parents=True, exist_ok=True)

    print("3) repositório de mentira, num branch de trabalho")
    local = _seed_repo(agent_dir)
    print(f"   {local}")

    print("4) delegando ao Kiro (pode levar alguns minutos)")
    limits = (await repos.users.get_by_id(user_id) or {}).get("limits", {}) or {}
    tool = CodeAgentTool(
        user_id=user_id,
        integration_repo=repos.integrations,
        credential_repo=repos.credentials,
        agent_dir=agent_dir,
        workspace=workspace,
        timeout=limits.get("max_job_duration_s", 1800),
    )
    report = await tool.execute(
        repo=str(local),
        instruction=_TASK,
        expected="soma(2, 3) devolve 5",
        verify="python -m pytest test_soma.py",
        constraints="Mude só a linha do return em soma.py.",
        focus=["soma.py"],
    )
    print("---- relatório da tool ----")
    print(report)
    print("---------------------------")

    print("5) o código mudou de verdade?")
    content = (local / "soma.py").read_text(encoding="utf-8")
    fixed = "a + b" in content
    print(f"   soma.py agora: {content.strip()!r}")

    tests = subprocess.run([sys.executable, "-m", "pytest", "test_soma.py", "-q"],
                           cwd=local, capture_output=True, text=True)
    print(f"   pytest: {'passou' if tests.returncode == 0 else 'falhou'}")

    await db.close()

    if fixed and tests.returncode == 0:
        print("\nOK: a chave funciona e o Kiro escreveu o código pedido.")
        return 0
    if "NÃO fez o trabalho" in report:
        print("\nFALHOU na autenticação: a chave foi recusada. Gere outra em "
              "app.kiro.dev → API Keys e atualize a credencial.")
        return 1
    print("\nFALHOU: o Kiro rodou mas não entregou a correção. Leia o log "
          "apontado no relatório acima.")
    return 1


sys.exit(asyncio.run(main()))
