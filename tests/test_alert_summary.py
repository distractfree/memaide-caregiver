import asyncio

from memaide.notify.alert_summary import SituationSummarizer, sanitize
from memaide.schemas import Role, Turn, VisionContext

_FALLBACK = "a possible emergency"


def _transcript(*texts):
    """Alternate agent/patient turns starting with the agent's opening line."""
    roles = [Role.AGENT, Role.PATIENT]
    return [Turn(role=roles[i % 2], text=t) for i, t in enumerate(texts)]


class _FakeClient:
    def __init__(self, reply=None, error=None, delay=0.0):
        self._reply = reply if reply is not None else {"situation": "a bad fall in the kitchen"}
        self._error = error
        self._delay = delay
        self.messages = None

    async def complete_json(self, messages, model=None, temperature=None):
        self.messages = messages
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._error:
            raise self._error
        return self._reply


async def test_phrase_uses_the_model_line():
    s = SituationSummarizer(_FakeClient())
    out = await s.phrase(_transcript("Hi", "I fell and I can't get up"), None, _FALLBACK)
    assert out == "a bad fall in the kitchen"


async def test_phrase_sends_transcript_and_scene_to_the_model():
    client = _FakeClient()
    s = SituationSummarizer(client)
    scene = VisionContext(description="A person on the kitchen floor.", label="person_on_floor")
    await s.phrase(_transcript("Hi", "I fell and I can't get up"), scene, _FALLBACK)
    rendered = client.messages[-1]["content"]
    assert "I fell and I can't get up" in rendered
    assert "A person on the kitchen floor." in rendered


async def test_phrase_falls_back_without_patient_speech():
    client = _FakeClient()
    s = SituationSummarizer(client)
    # Vision-only escalation: the agent has spoken, the person has not.
    assert await s.phrase([Turn(role=Role.AGENT, text="Hi")], None, _FALLBACK) == _FALLBACK
    assert client.messages is None  # no model call at all


async def test_phrase_falls_back_on_empty_transcript():
    s = SituationSummarizer(_FakeClient())
    assert await s.phrase(None, None, _FALLBACK) == _FALLBACK
    assert await s.phrase([], None, _FALLBACK) == _FALLBACK


async def test_phrase_falls_back_on_model_error():
    s = SituationSummarizer(_FakeClient(error=RuntimeError("boom")))
    out = await s.phrase(_transcript("Hi", "my chest hurts"), None, _FALLBACK)
    assert out == _FALLBACK


async def test_phrase_falls_back_on_timeout():
    s = SituationSummarizer(_FakeClient(delay=0.05), timeout=0.01)
    out = await s.phrase(_transcript("Hi", "my chest hurts"), None, _FALLBACK)
    assert out == _FALLBACK


async def test_phrase_falls_back_on_malformed_reply():
    for reply in ({"nope": "x"}, {"situation": 42}, {"situation": "   "}, "not a dict"):
        s = SituationSummarizer(_FakeClient(reply=reply))
        out = await s.phrase(_transcript("Hi", "my chest hurts"), None, _FALLBACK)
        assert out == _FALLBACK


async def test_phrase_is_sanitized_for_the_template():
    s = SituationSummarizer(_FakeClient(reply={"situation": "chest  pain\nand sweating."}))
    out = await s.phrase(_transcript("Hi", "my chest hurts"), None, _FALLBACK)
    assert out == "chest pain and sweating"


def test_sanitize_collapses_whitespace_and_drops_final_stop():
    assert sanitize("  a  fall\tin the\nkitchen.  ", 140) == "a fall in the kitchen"


def test_sanitize_cuts_back_to_a_whole_word():
    out = sanitize("a fall in the kitchen and no answer since", 20)
    assert out == "a fall in the"
    assert len(out) <= 20


def test_sanitize_returns_empty_when_it_cannot_cut_cleanly():
    assert sanitize("supercalifragilistic", 5) == ""


def test_sanitize_passes_short_text_through():
    assert sanitize("a possible fall", 140) == "a possible fall"
