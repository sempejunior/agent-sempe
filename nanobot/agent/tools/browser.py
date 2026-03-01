"""Browser tool — execute JavaScript in the active browser tab via Chrome DevTools Protocol."""

import asyncio
import json
import shutil
import subprocess
from typing import Any

import httpx
from loguru import logger

from nanobot.agent.tools.base import Tool

_CDP_HOST = "localhost"
_CDP_PORT = 9222
_CDP_URL = f"http://{_CDP_HOST}:{_CDP_PORT}"
_MAX_RETRIES = 5
_RETRY_DELAY = 2.0

_CHROME_FLAGS = [
    "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--disable-software-rasterizer", "--disable-dev-shm-usage",
    f"--remote-debugging-port={_CDP_PORT}",
    "--window-size=1200,650", "--window-position=80,30",
    "--disable-blink-features=AutomationControlled",
    "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "--lang=pt-BR", "--disable-infobars",
    "--disable-features=ChromeWhatsNewUI",
    "about:blank",
]

_STEALTH_JS = r"""
(() => {
  // 1. Hide navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // 2. Fake chrome runtime (missing in headless/automation mode)
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: () => {},
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
    };
  }

  // 3. Fake plugins (headless has 0 plugins)
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer',
          description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin',
          description: '' },
      ];
      plugins.refresh = () => {};
      return plugins;
    },
  });

  // 4. Fake languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['pt-BR', 'pt', 'en-US', 'en'],
  });

  // 5. Spoof permissions API (automation mode returns 'denied' for notifications)
  const origQuery = Notification.permission
    ? window.Notification.requestPermission
    : null;
  try {
    const originalQuery = window.navigator.permissions.query.bind(
      window.navigator.permissions
    );
    window.navigator.permissions.query = (params) => {
      if (params.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(params);
    };
  } catch (_) {}

  // 6. Fix broken WebGL vendor/renderer (gives away headless)
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return 'Google Inc. (Intel)';
    if (param === 37446) return 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, OpenGL 4.6)';
    return getParameter.call(this, param);
  };

  // 7. Prevent iframe detection of contentWindow mismatch
  try {
    const elementDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype, 'offsetHeight'
    );
    if (elementDescriptor) {
      Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', elementDescriptor);
    }
  } catch (_) {}

  // 8. Fix connection-rtt (0 in headless)
  try {
    if (navigator.connection && navigator.connection.rtt === 0) {
      Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
    }
  } catch (_) {}
})();
"""


def cdp_available() -> bool:
    """Check if a CDP-enabled browser is reachable (non-async, for registration time)."""
    import socket
    try:
        with socket.create_connection((_CDP_HOST, _CDP_PORT), timeout=1):
            return True
    except OSError:
        return False


def _launch_chromium() -> bool:
    """Try to launch Chromium in the background. Returns True if started."""
    import os
    display = os.environ.get("DISPLAY")
    if not display:
        return False
    chrome_bin = shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome_bin:
        return False
    try:
        subprocess.Popen(
            [chrome_bin, f"--display={display}"] + _CHROME_FLAGS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        logger.info("Launched Chromium (CDP port {})", _CDP_PORT)
        return True
    except OSError as e:
        logger.warning("Failed to launch Chromium: {}", e)
        return False


async def _ensure_cdp(retries: int = _MAX_RETRIES, delay: float = _RETRY_DELAY) -> bool:
    """Wait for CDP to become available, launching Chromium if needed."""
    if cdp_available():
        return True
    logger.info("CDP not available, attempting to start Chromium...")
    _launch_chromium()
    for attempt in range(1, retries + 1):
        await asyncio.sleep(delay)
        if cdp_available():
            logger.info("CDP ready after {}s", attempt * delay)
            return True
        logger.debug("Waiting for CDP... (attempt {}/{})", attempt, retries)
    return False


class BrowserTool(Tool):
    """Execute JavaScript in the active browser tab."""

    @property
    def name(self) -> str:
        return "browser"

    @property
    def description(self) -> str:
        return (
            "Execute JavaScript code in the active browser tab and return the result. "
            "Use this to read page content, fill forms, click elements by CSS selector, "
            "get the current URL, or interact with the DOM. "
            "Much faster and more reliable than visual coordinate-based clicking for web pages."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "JavaScript code to execute in the page context. "
                        "The last expression's value is returned. "
                        "Examples: "
                        "'document.title', "
                        "'document.querySelector(\"#email\").value = \"user@test.com\"', "
                        "'document.querySelector(\"form\").submit()', "
                        "'window.location.href', "
                        "'[...document.querySelectorAll(\"a\")].map(a => a.href)'"
                    ),
                },
                "url": {
                    "type": "string",
                    "description": (
                        "Navigate to this URL before executing code. "
                        "Omit to run code on the current page."
                    ),
                },
                "wait": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 10,
                    "description": (
                        "Seconds to wait after navigation before executing code (default: 1). "
                        "Only used when 'url' is provided."
                    ),
                },
            },
            "required": ["code"],
        }

    async def execute(self, **kwargs: Any) -> str:
        code: str = kwargs["code"]
        url: str | None = kwargs.get("url")
        wait: float = float(kwargs.get("wait", 1))

        if not await _ensure_cdp():
            return (
                f"Error: Chromium browser is not running and could not be started. "
                f"CDP port {_CDP_PORT} is unreachable after {_MAX_RETRIES} attempts."
            )

        try:
            ws_url = await self._get_ws_url()
        except Exception as e:
            return (
                f"Error: Cannot connect to browser CDP on port {_CDP_PORT}. "
                f"Details: {e}"
            )

        try:
            import websockets
            async with websockets.connect(ws_url, max_size=10 * 1024 * 1024) as ws:
                msg_id = 1

                await ws.send(json.dumps({
                    "id": msg_id,
                    "method": "Page.addScriptToEvaluateOnNewDocument",
                    "params": {"source": _STEALTH_JS},
                }))
                await self._recv_result(ws, msg_id)
                msg_id += 1

                if url:
                    await ws.send(json.dumps({
                        "id": msg_id,
                        "method": "Page.navigate",
                        "params": {"url": url},
                    }))
                    msg_id += 1
                    await self._recv_result(ws, msg_id - 1)
                    await asyncio.sleep(wait)

                await ws.send(json.dumps({
                    "id": msg_id,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": code,
                        "returnByValue": True,
                        "awaitPromise": True,
                        "timeout": 10_000,
                    },
                }))
                result = await self._recv_result(ws, msg_id)

        except Exception as e:
            return f"Error executing JavaScript: {e}"

        if "error" in result:
            return f"CDP error: {result['error'].get('message', result['error'])}"

        eval_result = result.get("result", {})
        exception = eval_result.get("exceptionDetails")
        if exception:
            text = exception.get("text", "")
            exc_obj = exception.get("exception", {})
            desc = exc_obj.get("description", exc_obj.get("value", ""))
            return f"JavaScript error: {text} {desc}".strip()

        value = eval_result.get("result", {})
        val_type = value.get("type", "undefined")
        if val_type == "undefined":
            return "(undefined — code executed successfully)"
        if val_type in ("string", "number", "boolean"):
            return str(value.get("value", ""))
        if "value" in value:
            return json.dumps(value["value"], indent=2, ensure_ascii=False, default=str)
        if "description" in value:
            return value["description"]
        return json.dumps(value, indent=2, ensure_ascii=False, default=str)

    async def _get_ws_url(self) -> str:
        """Get the WebSocket debugger URL of the first browser tab."""
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{_CDP_URL}/json")
            resp.raise_for_status()
            tabs = resp.json()

        for tab in tabs:
            if tab.get("type") == "page" and "webSocketDebuggerUrl" in tab:
                return tab["webSocketDebuggerUrl"]
        if tabs and "webSocketDebuggerUrl" in tabs[0]:
            return tabs[0]["webSocketDebuggerUrl"]
        raise RuntimeError("No browser tab found with CDP WebSocket URL")

    async def _recv_result(self, ws, msg_id: int, timeout: float = 15) -> dict:
        """Read WebSocket messages until we get the response for our msg_id."""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            msg = json.loads(raw)
            if msg.get("id") == msg_id:
                return msg
        raise TimeoutError(f"CDP response for id={msg_id} not received within {timeout}s")
