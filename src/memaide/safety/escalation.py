from memaide import config
from memaide.schemas import EscalationDecision, VisionContext


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
        if any(keyword in text for keyword in self.distress_keywords):
            triggered.append("distress_keyword")

        flags = set(vision.flags) if vision else set()
        for flag in sorted(flags & self.critical_flags):
            triggered.append(f"vision:{flag}")

        if seconds_since_last_patient_speech >= self.silence_seconds and flags:
            triggered.append("silence_with_abnormal_vision")

        escalate = bool(triggered)
        reason = "; ".join(triggered) if triggered else "no escalation conditions met"
        return EscalationDecision(escalate=escalate, reason=reason, triggered_by=triggered)
