"""Per-session recorder: persists every inbound video frame to disk for later review.

A seam (``SessionRecorder`` Protocol) with a no-op default so recording is opt-in and
never affects the vision/voice tasks. ``FileSessionRecorder`` decodes the data-URL JPEG
payload and writes one file per frame (``<seq>-<ts>.jpg``) plus an ordered ``manifest.json``
written on close. All I/O errors and bad payloads are logged and skipped, never raised, so
recording can't take down a connection. The manifest is only written on close, so an
unclean process kill leaves the per-frame ``.jpg`` files without a manifest; they remain
recoverable from their ``<seq>-<ts>.jpg`` filenames.
"""

import asyncio
import base64
import json
import logging
import time
from pathlib import Path
from typing import Callable, Protocol, runtime_checkable

_log = logging.getLogger(__name__)


@runtime_checkable
class SessionRecorder(Protocol):
    async def write(self, data_url: str) -> None: ...
    async def close(self) -> None: ...


class NullSessionRecorder:
    """Default no-op recorder: recording is opt-in (inject a FileSessionRecorder to enable)."""

    async def write(self, data_url: str) -> None:
        return None

    async def close(self) -> None:
        return None


class FileSessionRecorder:
    """Saves frames to ``<root>/<session_id>/<seq>-<ts>.jpg`` + ``manifest.json`` on close."""

    def __init__(
        self,
        session_id: str,
        root: str | Path,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._dir = Path(root) / session_id
        self._clock = clock or time.time
        self._seq = 0
        self._entries: list[dict] = []
        self._dir_made = False

    def _ensure_dir(self) -> None:
        if not self._dir_made:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._dir_made = True

    @staticmethod
    def _decode(data_url: str) -> bytes:
        payload = data_url.split(",", 1)[1] if "," in data_url else data_url
        return base64.b64decode(payload, validate=True)

    async def write(self, data_url: str) -> None:
        ts = self._clock()
        try:
            jpeg = self._decode(data_url)
        except Exception as exc:  # noqa: BLE001 - bad payload -> skip the frame
            _log.warning("recorder: bad frame payload, skipping: %s", exc)
            return
        name = f"{self._seq:06d}-{ts:.3f}.jpg"
        try:
            await asyncio.to_thread(self._ensure_dir)
            await asyncio.to_thread((self._dir / name).write_bytes, jpeg)
        except Exception as exc:  # noqa: BLE001 - persisting a frame must never kill the connection
            _log.warning("recorder: failed to persist frame, skipping: %s", exc)
            return
        self._entries.append({"seq": self._seq, "ts": ts, "file": name})
        self._seq += 1

    async def close(self) -> None:
        if not self._entries:
            return
        try:
            await asyncio.to_thread(self._ensure_dir)
            await asyncio.to_thread(
                (self._dir / "manifest.json").write_text,
                json.dumps(self._entries, indent=2),
            )
        except Exception as exc:  # noqa: BLE001 - manifest write must never raise
            _log.warning("recorder: manifest write failed: %s", exc)
