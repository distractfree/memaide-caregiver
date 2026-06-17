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
    assert call["model"] == "gpt-4o-mini"


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
