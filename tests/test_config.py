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


def test_vision_config_present():
    assert config.VISION_DETAIL in ("low", "high")
    assert config.VISION_EVAL_MODELS == ["gpt-4o-mini", "gpt-5.4-mini"]
    assert config.VISION_EVAL_DETAILS == ["low", "high"]
    # pricing is per-token USD for every eval model
    for model in config.VISION_EVAL_MODELS:
        assert {"in", "out"} <= set(config.VISION_PRICING[model])
        assert config.VISION_PRICING[model]["in"] > 0


def test_audio_and_ws_config_present():
    from memaide import config

    assert config.STT_MODEL == "gpt-4o-mini-transcribe"
    assert config.TTS_MODEL == "gpt-4o-mini-tts"
    assert isinstance(config.TTS_VOICE, str) and config.TTS_VOICE
    assert config.AUDIO_FORMAT
    assert config.AUDIO_SAMPLE_RATE > 0
    assert config.WS_HOST
    assert isinstance(config.WS_PORT, int) and config.WS_PORT > 0


def test_vision_interval_and_recordings_dir():
    assert config.VISION_INTERVAL_SECONDS == 2.0
    assert config.RECORDINGS_DIR == "recordings"


def test_infer_service_config_defaults():
    assert config.INFER_HOST == "0.0.0.0"
    assert config.INFER_PORT == 8080
    assert hasattr(config, "AI_AGENT_API_KEY")
