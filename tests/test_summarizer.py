"""SessionSummarizer: caregiver summary built from the concluded session only."""

import asyncio
from datetime import datetime, timezone

from memaide.agent.summarizer import SessionSummarizer
from memaide.schemas import HandoffType, Role, SessionRecord, Turn


class FakeClient:
    """Records the messages it was asked to complete and replays a canned JSON reply."""

    def __init__(self, reply=None, raises=None, hang=False):
        self.calls = []
        self._reply = reply if reply is not None else {"summary": "She fell in the kitchen."}
        self._raises = raises
        self._hang = hang

    async def complete_json(self, messages, model=None, temperature=None):
        self.calls.append({"messages": messages, "model": model})
        if self._hang:
            await asyncio.sleep(10)
        if self._raises is not None:
            raise self._raises
        return self._reply


def _record(transcript=None, **kw):
    base = dict(
        id="s1",
        patient_id="p1",
        started_at=datetime(2026, 7, 24, tzinfo=timezone.utc),
        ended_at=datetime(2026, 7, 24, tzinfo=timezone.utc),
        handoff_type=HandoffType.PATIENT_ENDED,
        transcript=transcript
        if transcript is not None
        else [
            Turn(role=Role.AGENT, text="Hi, I'm here to help. Can you tell me what's wrong?"),
            Turn(role=Role.PATIENT, text="I woke up and I didn't know where I was."),
            Turn(role=Role.AGENT, text="You're at home, in your bedroom. Stay sitting for me."),
        ],
        final_scene_label="bedroom",
    )
    base.update(kw)
    return SessionRecord(**base)


async def test_returns_the_model_summary():
    fc = FakeClient({"summary": "  She woke disoriented and I reoriented her.  "})
    out = await SessionSummarizer(fc).summarize(_record(), "patient_ended")
    assert out == "She woke disoriented and I reoriented her."


async def test_prompt_carries_transcript_and_scene_but_nothing_else():
    fc = FakeClient()
    await SessionSummarizer(fc).summarize(_record(), "patient_ended")
    payload = "\n".join(m["content"] for m in fc.calls[0]["messages"])
    assert "I woke up and I didn't know where I was." in payload
    assert "Stay sitting for me." in payload
    assert "bedroom" in payload
    # The summarizer is handed the record only, so patient-profile facts (medications,
    # conditions, address) cannot reach the prompt and so cannot be invented into a summary.
    assert "p1" not in payload


async def test_no_patient_turns_yields_no_summary_and_no_model_call():
    fc = FakeClient()
    record = _record(transcript=[Turn(role=Role.AGENT, text="Hi, I'm here to help.")])
    assert await SessionSummarizer(fc).summarize(record, "disconnected") is None
    assert fc.calls == []


async def test_empty_transcript_yields_no_summary():
    fc = FakeClient()
    assert await SessionSummarizer(fc).summarize(_record(transcript=[]), "disconnected") is None
    assert fc.calls == []


async def test_model_failure_yields_no_summary():
    fc = FakeClient(raises=RuntimeError("boom"))
    assert await SessionSummarizer(fc).summarize(_record(), "patient_ended") is None


async def test_slow_model_times_out_and_yields_no_summary():
    fc = FakeClient(hang=True)
    summarizer = SessionSummarizer(fc, timeout=0.01)
    assert await summarizer.summarize(_record(), "patient_ended") is None


async def test_missing_or_blank_summary_key_yields_none():
    for reply in ({}, {"summary": ""}, {"summary": "   "}, {"summary": None}, {"summary": 7}):
        fc = FakeClient(reply)
        assert await SessionSummarizer(fc).summarize(_record(), "patient_ended") is None


async def test_overlong_summary_is_cut_back_to_a_whole_sentence():
    long_first = "She pressed help because she woke confused about the date. " * 6
    fc = FakeClient({"summary": long_first + "Extra tail without a period"})
    out = await SessionSummarizer(fc, max_chars=120).summarize(_record(), "patient_ended")
    assert out is not None
    assert len(out) <= 120
    assert out.endswith(".")
    assert "Extra tail" not in out


async def test_overlong_summary_without_a_sentence_break_yields_none():
    fc = FakeClient({"summary": "x" * 500})
    assert await SessionSummarizer(fc, max_chars=120).summarize(_record(), "patient_ended") is None


async def test_escalation_and_outcome_reach_the_prompt():
    fc = FakeClient()
    record = _record(escalated=True)
    await SessionSummarizer(fc).summarize(record, "patient_ended")
    payload = "\n".join(m["content"] for m in fc.calls[0]["messages"])
    assert "escalated" in payload.lower()
    assert "patient_ended" in payload
