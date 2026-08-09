"""Terminate a child process and everything it spawned.

An agent CLI, ``npm`` or ``pytest`` spawn children of their own: killing the
direct child leaves them running, holding the pipes open and — for a code agent —
still editing the repository the orchestrator has already moved on from. Tools
here start their children with ``start_new_session=True``, so the process group
id equals the child's pid and one ``killpg`` reaches the whole tree.

The wait between the two signals tolerates being cancelled. Cleanup usually runs
while the caller is already unwinding from a cancellation, and letting that
cancellation escape between SIGTERM and SIGKILL is exactly how a process survives
the kill it was supposed to receive.
"""

from __future__ import annotations

import asyncio
import os
import signal

_GRACE_S = 5.0


async def kill_process_group(process: asyncio.subprocess.Process) -> None:
    """Signal the child's whole group, escalating to SIGKILL if it survives."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        if process.returncode is not None:
            return
        _signal_group(process, sig)
        if await _reaped(process):
            return


def _signal_group(process: asyncio.subprocess.Process, sig: int) -> None:
    """Fall back to the single child when the group is already gone."""
    try:
        os.killpg(os.getpgid(process.pid), sig)
    except (ProcessLookupError, PermissionError):
        process.kill()


async def _reaped(process: asyncio.subprocess.Process) -> bool:
    try:
        await asyncio.wait_for(asyncio.shield(process.wait()), timeout=_GRACE_S)
        return True
    except (asyncio.TimeoutError, asyncio.CancelledError):
        return False
