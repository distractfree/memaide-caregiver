import re

from memaide import config
from memaide.schemas import EscalationDecision, VisionContext

# Words that, immediately before a distress keyword, rule the symptom OUT
# ("no chest pain", "without bleeding"). Kept deliberately tight: only an
# adjacent negator with no punctuation between it and the keyword suppresses the
# match, so a real emergency like "No, I can't breathe" (where "no" answers a
# question and is comma-separated) still escalates.
_NEGATORS = {"no", "not", "without", "never", "none"}
_PREV_WORD = re.compile(r"([a-z']+)\s*$")


def _is_negated(text: str, keyword_start: int) -> bool:
    prefix = text[:keyword_start]
    match = _PREV_WORD.search(prefix)
    if not match:
        return False
    between = prefix[match.end():]
    if any(p in between for p in ",.;:!?"):
        return False
    prev = match.group(1)
    return prev in _NEGATORS or prev.endswith("n't")


def _has_unnegated_keyword(text: str, keywords: list[str]) -> bool:
    for keyword in keywords:
        start = 0
        while (idx := text.find(keyword, start)) != -1:
            if not _is_negated(text, idx):
                return True
            start = idx + 1
    return False


class EscalationMonitor:
    def __init__(
        self,
        silence_seconds: float = config.SILENCE_SECONDS,
        distress_keywords: list[str] | None = None,
        critical_flags: set[str] | None = None,
    ):
        self.silence_seconds = silence_seconds
        self.distress_keywords = distress_keywords or config.DISTRESS_KEYWORDS
        self.critical_flags = critical_flags or config.CRITICAL_VISION_FLAGS

    def check(
        self, 
        latest_patient_text: str | None,
        vision: VisionContext | None,
        seconds_since_last_patient_speech: float = 0.0,
        ) -> EscalationDecision:
        """Check for escalation conditions."""
        triggered: list[str] = []

        text = (latest_patient_text or "").lower()
        if _has_unnegated_keyword(text, self.distress_keywords):
            triggered.append("distress_keyword")

        flags = set(vision.flags) if vision else set()
        for flag in sorted(flags & self.critical_flags):
            triggered.append(f"vision:{flag}")

        if seconds_since_last_patient_speech >= self.silence_seconds and flags:
            triggered.append("silence_with_abnormal_vision")

        escalate = bool(triggered)
        reason = "; ".join(triggered) if triggered else "no escalation conditions met"
        return EscalationDecision(escalate=escalate, reason=reason, triggered_by=triggered)
