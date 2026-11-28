"""Read-only inspection of rdiff-backup repositories, cached because both calls can be slow."""
import os
import re
import subprocess
import time
from datetime import datetime
from typing import Optional

SNAPSHOT_TTL = 5 * 60
SIZE_TTL = 10 * 60

_snapshots: dict[str, tuple[float, list[datetime]]] = {}
_sizes: dict[str, tuple[float, Optional[int]]] = {}

TIME_LINE = re.compile(r"^\s*time: (\d+)\s*$", re.MULTILINE)


def parse_increments(output: str) -> list[datetime]:
    """Parse `rdiff-backup --parsable-output list increments`; includes the current mirror. Newest first."""
    times = {int(t) for t in TIME_LINE.findall(output)}
    return [datetime.fromtimestamp(t) for t in sorted(times, reverse=True)]


def list_snapshots(destination: str) -> list[datetime]:
    cached = _snapshots.get(destination)
    if cached and time.monotonic() - cached[0] < SNAPSHOT_TTL:
        return cached[1]
    try:
        result = subprocess.run(
            ["rdiff-backup", "--api-version", "201", "--parsable-output", "list", "increments", destination],
            capture_output=True, text=True, timeout=120,
        )
        snapshots = parse_increments(result.stdout) if result.returncode == 0 else []
    except (OSError, subprocess.SubprocessError):
        snapshots = []
    _snapshots[destination] = (time.monotonic(), snapshots)
    return snapshots


def _walk_size(path: str) -> int:
    total = 0
    with os.scandir(path) as entries:
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    total += _walk_size(entry.path)
                else:
                    total += entry.stat(follow_symlinks=False).st_size
            except OSError:
                pass
    return total


def directory_size(path: str) -> Optional[int]:
    cached = _sizes.get(path)
    if cached and time.monotonic() - cached[0] < SIZE_TTL:
        return cached[1]
    try:
        size = _walk_size(path)
    except OSError:
        size = None
    _sizes[path] = (time.monotonic(), size)
    return size


def invalidate(destination: str):
    _snapshots.pop(destination, None)
    _sizes.pop(destination, None)


def clear():
    _snapshots.clear()
    _sizes.clear()
