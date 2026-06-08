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
