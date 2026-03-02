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
_MAX_OUTPUT_LEN = 15000

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
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: () => {},
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
    };
  }

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

  Object.defineProperty(navigator, 'languages', {
    get: () => ['pt-BR', 'pt', 'en-US', 'en'],
  });

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

  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return 'Google Inc. (Intel)';
    if (param === 37446) return 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, OpenGL 4.6)';
    return getParameter.call(this, param);
  };

  try {
    const elementDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype, 'offsetHeight'
    );
    if (elementDescriptor) {
      Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', elementDescriptor);
    }
  } catch (_) {}

  try {
    if (navigator.connection && navigator.connection.rtt === 0) {
      Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
    }
  } catch (_) {}
})();
"""

_stealth_registered = False


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
    chrome_bin = (
        shutil.which("chromium")
        or shutil.which("chromium-browser")
        or shutil.which("google-chrome")
        or shutil.which("google-chrome-stable")
    )
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
    if not _launch_chromium():
        return False
    for attempt in range(1, retries + 1):
        await asyncio.sleep(delay)
        if cdp_available():
            logger.info("CDP ready after {}s", attempt * delay)
            return True
        logger.debug("Waiting for CDP... (attempt {}/{})", attempt, retries)
    return False


class BrowserTool(Tool):
    """Execute JavaScript in the active browser tab."""

    def __init__(self):
        self._cached_ws_url: str | None = None

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
                    "maximum": 30,
                    "description": (
                        "Maximum seconds to wait for page load after navigation (default: 10). "
                        "Returns early once the page finishes loading. "
                        "Only used when 'url' is provided."
                    ),
                },
            },
            "required": ["code"],
        }

    async def execute(self, **kwargs: Any) -> str:
        code: str = kwargs["code"]
        url: str | None = kwargs.get("url")
        wait: float = float(kwargs.get("wait", 10))

        if not await _ensure_cdp():
            return (
                f"Error: Chromium browser is not running and could not be started. "
                f"CDP port {_CDP_PORT} is unreachable after {_MAX_RETRIES} attempts."
            )

        try:
            ws_url = await self._get_ws_url()
        except Exception as e:
            self._cached_ws_url = None
            return (
                f"Error: Cannot connect to browser CDP on port {_CDP_PORT}. "
                f"Details: {e}"
            )

        try:
            import websockets
            async with websockets.connect(ws_url, max_size=10 * 1024 * 1024) as ws:
                msg_id = 1

                msg_id = await self._inject_stealth(ws, msg_id)

                if url:
                    msg_id = await self._navigate(ws, msg_id, url, wait)

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
            self._reset_state()
            return f"Error executing JavaScript: {e}"

        return self._format_result(result)

    async def _inject_stealth(self, ws, msg_id: int) -> int:
        global _stealth_registered
        if _stealth_registered:
            return msg_id
        await ws.send(json.dumps({
            "id": msg_id,
            "method": "Page.addScriptToEvaluateOnNewDocument",
            "params": {"source": _STEALTH_JS},
        }))
        await self._recv_result(ws, msg_id)
        _stealth_registered = True
        return msg_id + 1

    async def _navigate(self, ws, msg_id: int, url: str, timeout: float) -> int:
        await ws.send(json.dumps({
            "id": msg_id, "method": "Page.enable", "params": {},
        }))
        await self._recv_result(ws, msg_id)
        msg_id += 1

        await ws.send(json.dumps({
            "id": msg_id, "method": "Page.navigate", "params": {"url": url},
        }))
        nav_result = await self._recv_result(ws, msg_id)
        msg_id += 1

        error_text = nav_result.get("result", {}).get("errorText")
        if error_text:
            logger.warning("Navigation error: {}", error_text)
            return msg_id

        await self._wait_for_load(ws, timeout=timeout)
        return msg_id

    async def _wait_for_load(self, ws, timeout: float) -> None:
        """Wait for Page.loadEventFired or timeout, whichever comes first."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                return
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                msg = json.loads(raw)
                if msg.get("method") == "Page.loadEventFired":
                    return
            except asyncio.TimeoutError:
                return

    def _format_result(self, result: dict) -> str:
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
            output = str(value.get("value", ""))
        elif "value" in value:
            output = json.dumps(
                value["value"], indent=2, ensure_ascii=False, default=str
            )
        elif "description" in value:
            output = value["description"]
        else:
            output = json.dumps(value, indent=2, ensure_ascii=False, default=str)

        if len(output) > _MAX_OUTPUT_LEN:
            output = (
                output[:_MAX_OUTPUT_LEN]
                + f"\n... (truncated, {len(output) - _MAX_OUTPUT_LEN} more chars)"
            )
        return output

    def _reset_state(self) -> None:
        global _stealth_registered
        self._cached_ws_url = None
        _stealth_registered = False

    async def _get_ws_url(self) -> str:
        """Get the WebSocket debugger URL of the first browser tab."""
        if self._cached_ws_url:
            return self._cached_ws_url

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{_CDP_URL}/json")
            resp.raise_for_status()
            tabs = resp.json()

        for tab in tabs:
            if tab.get("type") == "page" and "webSocketDebuggerUrl" in tab:
                self._cached_ws_url = tab["webSocketDebuggerUrl"]
                return self._cached_ws_url
        if tabs and "webSocketDebuggerUrl" in tabs[0]:
            self._cached_ws_url = tabs[0]["webSocketDebuggerUrl"]
            return self._cached_ws_url
        raise RuntimeError("No browser tab found with CDP WebSocket URL")

    async def _recv_result(self, ws, msg_id: int, timeout: float = 15) -> dict:
        """Read WebSocket messages until we get the response for our msg_id."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if msg.get("id") == msg_id:
                return msg
        raise TimeoutError(f"CDP response for id={msg_id} not received within {timeout}s")
