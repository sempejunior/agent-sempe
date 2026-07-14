"""Testes: chat web resolve cliente do dono e save_memory não duplica fatos."""

from unittest.mock import AsyncMock

from nanobot.bus.events import InboundMessage
from nanobot.client.resolver import resolve_client


def _web_msg(user_id="u1"):
    return InboundMessage(
        channel="web", sender_id="user", chat_id=user_id,
        content="oi", user_id=user_id,
    )


async def test_web_message_resolves_client_for_owner(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    client_id = await resolve_client(
        _web_msg(), "u1",
        clients=repos.clients,
        identities=repos.client_identities,
        client_memories=repos.client_memories,
    )
    assert client_id is not None
    client = await repos.clients.get(client_id)
    assert client["display_name"] == "u1"
    identity = await repos.client_identities.lookup("u1", "web", "u1")
    assert identity == client_id


async def test_web_message_reuses_existing_identity(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    first = await resolve_client(
        _web_msg(), "u1",
        clients=repos.clients,
        identities=repos.client_identities,
        client_memories=repos.client_memories,
    )
    second = await resolve_client(
        _web_msg(), "u1",
        clients=repos.clients,
        identities=repos.client_identities,
        client_memories=repos.client_memories,
    )
    assert first == second


async def test_cli_and_system_messages_have_no_client(repos):
    await repos.users.create({"user_id": "u1", "display_name": "u1"})
    for channel in ("cli", "system"):
        msg = InboundMessage(
            channel=channel, sender_id="user", chat_id="x",
            content="oi", user_id="u1",
        )
        assert await resolve_client(
            msg, "u1",
            clients=repos.clients,
            identities=repos.client_identities,
            client_memories=repos.client_memories,
        ) is None


async def test_save_memory_skips_duplicate_fact():
    from nanobot.agent.tools.memory import SaveMemoryTool

    memory = AsyncMock()
    memory.read_long_term.return_value = (
        "# Long-term Memory\n\n- User is a team leader\n"
    )
    tool = SaveMemoryTool(memory)

    result = await tool.execute(fact="- User is a team leader")
    assert result.startswith("Already memorized")
    memory.write_long_term.assert_not_awaited()

    result = await tool.execute(fact="- User's name is Carlos")
    assert result.startswith("Memorized")
    memory.write_long_term.assert_awaited_once()
