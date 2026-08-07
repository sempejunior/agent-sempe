"""Testes do filtro de servidores MCP por agente.

O filtro valia só para os servidores de configuração; as tools vindas das
integrações do usuário entravam em todo agente. Com o MCP do Azure DevOps ativo
isso são 46 definições no prompt de cada turno de cada agente do usuário —
inclusive dos que não têm nada a ver com Azure.
"""

from nanobot.agent.loop import AgentLoop

_SERVERS = ("mcp_azure_devops", "azure", "mcp_github")


def test_the_server_is_resolved_from_the_tool_name():
    assert AgentLoop._mcp_server_of(
        "mcp_mcp_azure_devops_get_work_item", _SERVERS) == "mcp_azure_devops"
    assert AgentLoop._mcp_server_of("mcp_mcp_github_list_repos", _SERVERS) == "mcp_github"


def test_the_longest_server_name_wins():
    """Um servidor 'azure' não pode reclamar uma tool de 'azure_devops'."""
    assert AgentLoop._mcp_server_of(
        "mcp_azure_devops_get_work_item", ("azure", "azure_devops")) == "azure_devops"


def test_an_unknown_prefix_falls_back_to_the_first_segment():
    assert AgentLoop._mcp_server_of("mcp_desconhecido_faz_algo", ()) == "desconhecido"


class _FakeAgents:
    def __init__(self, config):
        self._config = config

    async def get_agent(self, user_id, agent_id):
        return {"agent_id": agent_id, "agent_config": self._config}


def _filter_for(config) -> set[str] | None:
    """A mesma leitura que o loop faz do agent_config."""
    raw = config.get("mcp_servers_enabled")
    return set(raw) if isinstance(raw, list) else None


def test_no_configuration_means_every_server():
    """Agente nunca configurado continua vendo tudo — não muda comportamento."""
    assert _filter_for({}) is None


def test_an_empty_list_is_an_explicit_none():
    """É o que o Agent Studio grava quando o cliente não escolhe nenhum MCP."""
    assert _filter_for({"mcp_servers_enabled": []}) == set()


def test_a_list_selects_exactly_those_servers():
    chosen = _filter_for({"mcp_servers_enabled": ["mcp_azure_devops"]})

    assert chosen == {"mcp_azure_devops"}
    assert AgentLoop._mcp_server_of(
        "mcp_mcp_azure_devops_get_work_item", _SERVERS) in chosen
    assert AgentLoop._mcp_server_of("mcp_mcp_github_list_repos", _SERVERS) not in chosen
