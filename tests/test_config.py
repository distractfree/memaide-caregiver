from memaide import config


def test_model_names():
    assert config.BRAIN_MODEL == "gpt-5.4-mini"
    assert config.VISION_MODEL == "gpt-4o-mini"
    assert config.REALTIME_MODEL == "gpt-4o-mini-realtime-preview"
    assert config.JUDGE_MODEL == "claude-opus-4-8"


def test_escalation_constants():
    assert config.SILENCE_SECONDS > 0
    assert "chest pain" in config.DISTRESS_KEYWORDS
    assert "person_on_floor" in config.CRITICAL_VISION_FLAGS
    assert all(k == k.lower() for k in config.DISTRESS_KEYWORDS)


def test_opening_line_is_a_question():
    assert config.OPENING_LINE.strip().endswith("?")
