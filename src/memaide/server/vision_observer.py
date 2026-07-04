"""Console + preview trace for each described glasses frame, with escalation notify.

Injected into the server via ``ServerDeps`` (default ``None`` -> no behavior change). It is
invoked once per *described* frame (after the pipeline's interval throttle) with that frame's
``VisionContext``. On each call it:

- logs ``[vision] desc=... label=... flags=...``;
- runs the escalation check through the session's proactive (silence-tick) path, using the
  flags from ``flag_source`` (default the rule ``ctx.flags``; the bridge server injects a
  promoter so the describer's critical ``advisory_flags`` can drive the demo);
- when it escalates, logs ``[brain] reaction=...`` (the proactive suggestion) and
  ``[escalation] TRIGGERED by [...]``, then fires the optional ``notify`` callback guarded by
  a per-episode cooldown so a persistent condition sends at most one alert per window;
- hands the frame + trace to the optional ``preview`` writer for the live laptop view.

Like the recorder, it never raises into the connection: every path is log-and-swallow.
"""

import asyncio
import logging
import time
from typing import Any, Callable

from memaide import config
from memaide.schemas import EscalationDecision, VisionContext

_log = logging.getLogger(__name__)

# The observer runs frames-only (no patient speech), so escalation is driven purely by the
# vision flags, not by the silence timer; pass 0 so only the flag triggers fire.
_NO_SILENCE = 0.0

FlagSource = Callable[[VisionContext], list[str]]
Notify = Callable[[EscalationDecision, VisionContext], None]


class VisionObserver:
    def __init__(
        self,
        notify: Notify | None = None,
        preview: Any = None,
        flag_source: FlagSource | None = None,
        notify_cooldown: float = config.ESCALATION_NOTIFY_COOLDOWN,
        clock: Callable[[], float] | None = None,
    ):
        self._notify = notify
        self._preview = preview
        self._flag_source = flag_source or (lambda ctx: list(ctx.flags))
        self._cooldown = notify_cooldown
        self._clock = clock or time.monotonic
        self._last_notify_at: float | None = None

    async def on_scene(
        self, ctx: VisionContext, session: Any, frame_url: str | None = None
    ) -> None:
        try:
            flags = self._flag_source(ctx)
            _log.info(
                "[vision] desc=%r label=%r flags=%s", ctx.description, ctx.label, flags
            )
            eval_ctx = ctx.model_copy(update={"flags": flags})
            turn = session.on_silence_tick(_NO_SILENCE, eval_ctx)
            decision = session.last_escalation
            if decision is not None and decision.escalate:
                _log.info("[brain] reaction=%r", turn.text if turn else "")
                _log.info(
                    "[escalation] TRIGGERED by %s", list(decision.triggered_by)
                )
                await self._maybe_notify(decision, ctx)
            if self._preview is not None:
                await self._preview.write(
                    ctx=ctx, frame_url=frame_url, flags=flags, decision=decision
                )
        except Exception as exc:  # noqa: BLE001 - observer must never kill the connection
            _log.warning("VisionObserver failed (swallowed): %s", exc)

    async def _maybe_notify(
        self, decision: EscalationDecision, ctx: VisionContext
    ) -> None:
        if self._notify is None:
            return
        now = self._clock()
        if (
            self._last_notify_at is not None
            and (now - self._last_notify_at) < self._cooldown
        ):
            _log.info("[escalation] notify suppressed (cooldown)")
            return
        self._last_notify_at = now
        # notify is sync (blocking urllib); keep it off the event loop.
        await asyncio.to_thread(self._notify, decision, ctx)
