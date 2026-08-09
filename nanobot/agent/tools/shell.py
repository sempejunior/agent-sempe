"""Shell execution tool.

The child process gets a **built** environment, never the gateway's own: the
master credential key and the provider API keys live in ``os.environ``, and a
command as simple as ``env`` would hand them to the model. Only an allowlist of
harmless variables plus what the caller injects crosses the boundary.

Confinement is by ``working_dir``, resolved and checked against ``allowed_root``
the same way ``filesystem._resolve_path`` does it. There is no attempt to police
the command string for paths: a shell can reach anything through indirection, so
a regex over the command reads as protection while blocking legitimate calls like
``/usr/bin/python3``. Real confinement needs a namespace, and that is tracked
separately.
"""

import asyncio
import os
import re
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.process import kill_process_group

_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM")
_MAX_OUTPUT_CHARS = 10_000


class ExecTool(Tool):
    """Tool to execute shell commands."""

    parallel_safe = False
    """Commands share one working tree; a concurrent batch is a race on it."""

    def __init__(
        self,
        timeout: int = 60,
        working_dir: str | None = None,
        deny_patterns: list[str] | None = None,
        allow_patterns: list[str] | None = None,
        allowed_root: Path | None = None,
        env_extra: dict[str, str] | None = None,
    ):
        self.timeout = timeout
        self.working_dir = working_dir
        self.deny_patterns = deny_patterns or [
            r"\brm\s+-[rf]{1,2}\b",          # rm -r, rm -rf, rm -fr
            r"\bdel\s+/[fq]\b",              # del /f, del /q
            r"\brmdir\s+/s\b",               # rmdir /s
            r"(?:^|[;&|]\s*)format\b",       # format (as standalone command only)
            r"\b(mkfs|diskpart)\b",          # disk operations
            r"\bdd\s+if=",                   # dd
            r">\s*/dev/sd",                  # write to disk
            r"\b(shutdown|reboot|poweroff)\b",  # system power
            r":\(\)\s*\{.*\};\s*:",          # fork bomb
        ]
        self.allow_patterns = allow_patterns or []
        self.allowed_root = allowed_root
        self.env_extra = env_extra or {}

    @property
    def name(self) -> str:
        return "exec"

    @property
    def description(self) -> str:
        return "Execute a shell command and return its output. Use with caution."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Optional working directory for the command"
                }
            },
            "required": ["command"]
        }

    def _build_env(self) -> dict[str, str]:
        """Environment for the child: allowlisted variables plus injected ones."""
        env = {key: os.environ[key] for key in _ENV_ALLOWLIST if key in os.environ}
        env.update(self.env_extra)
        return env

    def _resolve_cwd(self, working_dir: str | None) -> Path:
        """Resolve the working directory, keeping it under ``allowed_root``."""
        raw = working_dir or self.working_dir or os.getcwd()
        cwd = Path(raw).expanduser()
        if not cwd.is_absolute() and self.allowed_root:
            cwd = self.allowed_root / cwd
        cwd = cwd.resolve()
        if self.allowed_root:
            root = self.allowed_root.resolve()
            try:
                cwd.relative_to(root)
            except ValueError:
                raise PermissionError(
                    f"working_dir {raw} is outside the allowed directory {root}"
                ) from None
        return cwd

    async def execute(self, command: str, working_dir: str | None = None, **kwargs: Any) -> str:
        guard_error = self._guard_command(command)
        if guard_error:
            return guard_error

        try:
            cwd = self._resolve_cwd(working_dir)
        except PermissionError as e:
            return f"Error: {e}"
        if not cwd.is_dir():
            return f"Error: working_dir {cwd} does not exist"

        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(cwd),
                env=self._build_env(),
                start_new_session=True,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.timeout
                )
            except asyncio.TimeoutError:
                await kill_process_group(process)
                return f"Error: Command timed out after {self.timeout} seconds"
            except asyncio.CancelledError:
                await kill_process_group(process)
                raise

            output_parts = []

            if stdout:
                output_parts.append(stdout.decode("utf-8", errors="replace"))

            if stderr:
                stderr_text = stderr.decode("utf-8", errors="replace")
                if stderr_text.strip():
                    output_parts.append(f"STDERR:\n{stderr_text}")

            if process.returncode != 0:
                output_parts.append(f"\nExit code: {process.returncode}")

            result = "\n".join(output_parts) if output_parts else "(no output)"

            if len(result) > _MAX_OUTPUT_CHARS:
                dropped = len(result) - _MAX_OUTPUT_CHARS
                result = result[:_MAX_OUTPUT_CHARS] + f"\n... (truncated, {dropped} more chars)"

            return result

        except Exception as e:
            return f"Error executing command: {str(e)}"

    def _guard_command(self, command: str) -> str | None:
        """Reject commands matching a destructive pattern."""
        lower = command.strip().lower()

        for pattern in self.deny_patterns:
            if re.search(pattern, lower):
                return "Error: Command blocked by safety guard (dangerous pattern detected)"

        if self.allow_patterns and not any(re.search(p, lower) for p in self.allow_patterns):
            return "Error: Command blocked by safety guard (not in allowlist)"

        return None
