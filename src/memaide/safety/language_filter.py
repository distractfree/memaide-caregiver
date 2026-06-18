import unicodedata


def _has_foreign_letter(token: str) -> bool:
    """True if the token contains a letter from a non-Latin script.

    Latin letters (including accented ones like é, ñ, ü) have "LATIN" in their Unicode
    name; Hebrew/Cyrillic/Greek/Arabic/CJK letters do not. Non-letters (digits,
    punctuation, em-dashes, smart quotes) are ignored.
    """
    for ch in token:
        if ch.isalpha() and "LATIN" not in unicodedata.name(ch, ""):
            return True
    return False


def strip_foreign_text(text: str) -> str:
    """Drop whitespace-tokens containing non-Latin letters; leave clean text untouched.

    Guards spoken replies against a model occasionally dropping in a foreign-language
    word (e.g. a stray Hebrew token in otherwise-English text). Clean text is returned
    unchanged so normal spacing is preserved; only a leaked reply is rebuilt.
    """
    tokens = text.split()
    if not any(_has_foreign_letter(t) for t in tokens):
        return text
    return " ".join(t for t in tokens if not _has_foreign_letter(t))
