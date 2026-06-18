from memaide.safety.language_filter import strip_foreign_text


def test_strips_hebrew_word_from_mixed_text():
    assert strip_foreign_text("I am שלום here") == "I am here"


def test_leaves_clean_english_untouched_including_accents_and_dash():
    text = "You're doing well, Walt — your café visit sounds lovely."
    assert strip_foreign_text(text) == text


def test_strips_the_real_transcript_leak():
    leaked = "That could בהחלט make you feel lightheaded."
    assert strip_foreign_text(leaked) == "That could make you feel lightheaded."
