"""Tests for the VisionObserver per-described-frame trace + escalation notify."""

from memaide.agent.session import AgentSession
from memaide.schemas import EscalationDecision, PatientContext, VisionContext
from memaide.server.vision_observer import VisionObserver


class _RecordingNotify:
    """Sync notify callback that records each (decision, ctx) it is handed."""

    def __init__(self, exc: Exception | None = None):
        self.calls: list[tuple[EscalationDecision, VisionContext]] = []
        self.exc = exc

    def __call__(self, decision: EscalationDecision, ctx: VisionContext) -> None:
        self.calls.append((decision, ctx))
        if self.exc is not None:
            raise self.exc


class _RecordingPreview:
    def __init__(self, exc: Exception | None = None):
        self.calls: list[dict] = []
        self.exc = exc

    async def write(self, **kw) -> None:
        self.calls.append(kw)
        if self.exc is not None:
            raise self.exc


def _session() -> AgentSession:
    # brain is never called on the silence/proactive path, so a bare object is fine.
    return AgentSession(brain=object(), patient=PatientContext(patient_id="p", name="P"))


def _ctx(flags=None, advisory=None, label="scene") -> VisionContext:
    return VisionContext(
        description="a described scene",
        label=label,
        flags=list(flags or []),
        advisory_flags=list(advisory or []),
    )


async def test_non_escalating_scene_does_not_notify():
    notify = _RecordingNotify()
    obs = VisionObserver(notify=notify)
    await obs.on_scene(_ctx(flags=[]), _session())
    assert notify.calls == []


async def test_critical_flag_scene_notifies_once():
    notify = _RecordingNotify()
    obs = VisionObserver(notify=notify)
    ctx = _ctx(flags=["person_on_floor"])
    await obs.on_scene(ctx, _session())

    assert len(notify.calls) == 1
    decision, seen_ctx = notify.calls[0]
    assert decision.escalate is True
    assert "vision:person_on_floor" in decision.triggered_by
    assert seen_ctx is ctx


async def test_notify_respects_cooldown_then_fires_again():
    now = {"t": 1000.0}
    notify = _RecordingNotify()
    obs = VisionObserver(notify=notify, notify_cooldown=60.0, clock=lambda: now["t"])
    session = _session()

    await obs.on_scene(_ctx(flags=["fall_detected"]), session)  # fires
    now["t"] += 30.0
    await obs.on_scene(_ctx(flags=["fall_detected"]), session)  # within cooldown -> suppressed
    now["t"] += 31.0
    await obs.on_scene(_ctx(flags=["fall_detected"]), session)  # cooldown elapsed -> fires

    assert len(notify.calls) == 2


async def test_flag_source_promotes_advisory_flags():
    # The LLM describer emits advisory_flags; a promoter maps critical ones into the
    # rule flags that drive escalation.
    notify = _RecordingNotify()
    obs = VisionObserver(
        notify=notify,
        flag_source=lambda c: [f for f in c.advisory_flags if f == "person_on_floor"],
    )
    await obs.on_scene(_ctx(flags=[], advisory=["person_on_floor"]), _session())
    assert len(notify.calls) == 1


async def test_observer_swallows_notify_and_preview_errors():
    obs = VisionObserver(
        notify=_RecordingNotify(exc=RuntimeError("notify boom")),
        preview=_RecordingPreview(exc=RuntimeError("preview boom")),
    )
    # Must not raise.
    await obs.on_scene(_ctx(flags=["person_on_floor"]), _session())


async def test_preview_receives_frame_and_flags():
    preview = _RecordingPreview()
    obs = VisionObserver(preview=preview)
    await obs.on_scene(_ctx(flags=["person_on_floor"]), _session(), frame_url="data:,abc")

    assert len(preview.calls) == 1
    kw = preview.calls[0]
    assert kw["frame_url"] == "data:,abc"
    assert kw["flags"] == ["person_on_floor"]
    assert kw["decision"].escalate is True
