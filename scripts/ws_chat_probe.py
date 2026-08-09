"""Fala com um agente pelo mesmo WebSocket que o chat da ferramenta usa.

Existe para observar um turno real de ponta a ponta: o painel mostra chips e a
resposta final, mas esconde a sequência — quais tools rodaram, em que ordem,
quanto tempo cada uma levou, e o que chegou depois do turno fechar. Um turno de
sustentação fecha em segundos e o trabalho continua num job; sem ficar ouvindo
depois da resposta, a parte que mais importa passa despercebida.

Uso:
    python scripts/ws_chat_probe.py <token> <agent_id> <session_key> <mensagem> [segundos]
"""

from __future__ import annotations

import asyncio
import json
import sys
import time

import websockets

_TRACE_CLIP = 700


async def probe(token: str, agent_id: str, session_key: str, message: str,
                listen_s: float) -> None:
    url = f"ws://localhost:18790/ws/chat?token={token}"
    started = time.monotonic()

    def stamp() -> str:
        return f"[{time.monotonic() - started:7.1f}s]"

    async with websockets.connect(url, max_size=None, ping_interval=20) as ws:
        print(f"{stamp()} CONECTADO")
        await ws.send(json.dumps({
            "type": "message", "content": message,
            "session_key": session_key, "agent_id": agent_id, "trace": True,
        }))
        print(f"{stamp()} ENVIADO: {message}")

        while time.monotonic() - started < listen_s:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=15)
            except asyncio.TimeoutError:
                await ws.send(json.dumps({"type": "ping"}))
                continue
            except websockets.ConnectionClosed as e:
                print(f"{stamp()} SOCKET FECHADO: {e}")
                return
            _render(json.loads(raw), stamp())

    print(f"{stamp()} FIM DA JANELA DE ESCUTA")


def _render(data: dict, when: str) -> None:
    kind = data.get("type", "?")
    if kind == "pong":
        return
    if kind == "trace":
        payload = {k: v for k, v in data.items() if k not in ("type", "session_key")}
        text = json.dumps(payload, ensure_ascii=False)
        print(f"{when} trace   {text[:_TRACE_CLIP]}")
        return
    content = str(data.get("content", ""))
    if kind == "response":
        print(f"{when} RESPOSTA ({len(content)} chars)\n{content}\n{'-' * 70}")
        return
    print(f"{when} {kind:8} {content[:400]}")


if __name__ == "__main__":
    listen = float(sys.argv[5]) if len(sys.argv) > 5 else 600.0
    asyncio.run(probe(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], listen))
