from typing import Any

from memaide import config
from memaide.prompts.system_prompt import build_system_prompt
from memaide.safety.language_filter import strip_foreign_text
from memaide.schemas import AgentDecision, PatientContext, Role, Turn, VisionContext

_ROLE_MAP = {
    Role.AGENT: "assistant",
    Role.PATIENT: "user",
    Role.SYSTEM: "system",
}


class AgentBrain:
    """Wraps a JSON-chat client with the MemAide system prompt and message assembly.

    ``client`` must expose ``async complete_json(messages, model=?, temperature=?)``.
    """

    def __init__(self, client: Any, patient: PatientContext, model: str = config.BRAIN_MODEL):
        self._client = client
        self._patient = patient
        self._model = model
        self._system_prompt = build_system_prompt(patient)

    def _build_messages(
        self,
        transcript: list[Turn],
        vision: VisionContext | None,
        extra_context: list[str] | None = None,
        vision_pending: bool = False,
    ) -> list[dict]:
        messages: list[dict] = [{"role": "system", "content": self._system_prompt}]
        for turn in transcript:
            messages.append({"role": _ROLE_MAP[turn.role], "content": turn.text})
        for note in extra_context or []:
            messages.append({"role": "system", "content": note})
        if vision is not None:
            flags = ", ".join(vision.flags) if vision.flags else "none"
            content = (
                f"[VISION CONTEXT] Scene: {vision.label}. "
                f"{vision.description} Flags: {flags}."
            )
            if vision.advisory_flags:
                content += f" Advisory: {', '.join(vision.advisory_flags)}."
            messages.append({"role": "system", "content": content})
        elif vision_pending:
            # The camera is on but the first scene description hasn't landed yet. Guide the
            # agent to stall gracefully instead of flatly claiming it cannot see.
            messages.append({
                "role": "system",
                "content": (
                    "[VISION CONTEXT] A camera photo is being processed but is not ready yet. "
                    "If the person asks what you see, tell them to give you a second to look "
                    "— do not say that you cannot see."
                ),
            })
        return messages

    async def respond(
        self,
        transcript: list[Turn],
        vision: VisionContext | None = None,
        extra_context: list[str] | None = None,
        vision_pending: bool = False,
    ) -> AgentDecision:
        messages = self._build_messages(transcript, vision, extra_context, vision_pending)
        data = await self._client.complete_json(messages, model=self._model)
        decision = AgentDecision.model_validate(data)
        return decision.model_copy(
            update={"reply_text": strip_foreign_text(decision.reply_text)}
        )
