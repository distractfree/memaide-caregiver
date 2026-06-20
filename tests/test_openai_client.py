from memaide import config
from memaide.io.openai_client import OpenAIClient


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self):
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse('{"reply_text": "hi", "intent": "reassure"}')


class _FakeChat:
    def __init__(self):
        self.completions = _FakeCompletions()


class _FakeSDK:
    def __init__(self):
        self.chat = _FakeChat()


async def test_complete_json_parses_and_requests_json_mode():
    sdk = _FakeSDK()
    client = OpenAIClient(client=sdk)
    out = await client.complete_json([{"role": "user", "content": "hello"}])
    assert out == {"reply_text": "hi", "intent": "reassure"}
    call = sdk.chat.completions.calls[0]
    assert call["response_format"] == {"type": "json_object"}
    assert call["model"] == config.BRAIN_MODEL


async def test_fixed_temperature_model_omits_temperature():
    # gpt-5-mini rejects any non-default temperature; the client must not send it.
    sdk = _FakeSDK()
    client = OpenAIClient(client=sdk)
    await client.complete_json([{"role": "user", "content": "hi"}], model="gpt-5-mini")
    call = sdk.chat.completions.calls[0]
    assert "temperature" not in call


async def test_normal_model_includes_temperature():
    sdk = _FakeSDK()
    client = OpenAIClient(client=sdk)
    await client.complete_json(
        [{"role": "user", "content": "hi"}], model="gpt-5.4-mini", temperature=0.4
    )
    call = sdk.chat.completions.calls[0]
    assert call["temperature"] == 0.4


class _FlakyCompletions:
    """Raises ``exc`` the first ``fail_times`` calls, then succeeds."""

    def __init__(self, exc, fail_times):
        self.exc = exc
        self.fail_times = fail_times
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise self.exc
        return _FakeResponse('{"ok": true}')


class _FlakyChat:
    def __init__(self, exc, fail_times):
        self.completions = _FlakyCompletions(exc, fail_times)


class _FlakySDK:
    def __init__(self, exc, fail_times):
        self.chat = _FlakyChat(exc, fail_times)


class _TransientError(Exception):
    """Mimics the intermittent gpt-5.4 body-read 400."""


async def test_complete_json_retries_transient_errors():
    err = _TransientError(
        "Error code: 400 - something went wrong reading your request"
    )
    sdk = _FlakySDK(err, fail_times=2)
    client = OpenAIClient(client=sdk)
    out = await client.complete_json(
        [{"role": "user", "content": "hi"}], retry_base_delay=0
    )
    assert out == {"ok": True}
    assert sdk.chat.completions.calls == 3  # 2 failures + 1 success


async def test_complete_json_does_not_retry_real_errors():
    sdk = _FlakySDK(ValueError("genuinely bad input"), fail_times=2)
    client = OpenAIClient(client=sdk)
    try:
        await client.complete_json([{"role": "user", "content": "hi"}], retry_base_delay=0)
        raised = False
    except ValueError:
        raised = True
    assert raised
    assert sdk.chat.completions.calls == 1  # no retry on non-transient errors


async def test_complete_json_with_raw_returns_parsed_and_raw():
    import json as _json

    class _Msg:
        content = _json.dumps({"label": "kitchen"})

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]
        usage = type("U", (), {"prompt_tokens": 2833, "completion_tokens": 20})()

    class _Completions:
        async def create(self, **kwargs):
            self.kwargs = kwargs
            return _Resp()

    class _Chat:
        completions = _Completions()

    class _SDK:
        chat = _Chat()

    client = OpenAIClient(client=_SDK())
    data, resp = await client.complete_json_with_raw(
        [{"role": "user", "content": "hi"}], model="gpt-4o-mini", temperature=0.2
    )
    assert data == {"label": "kitchen"}
    assert resp.usage.prompt_tokens == 2833
    assert resp.usage.completion_tokens == 20
