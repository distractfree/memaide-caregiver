"""The agent brain: turns transcript + vision context into an AgentDecision."""

from typing import Any

from memaide.prompts.system_prompt import build_system_prompt
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

    def __init__(self, client: Any, patient: PatientContext):
        self._client = client
        self._patient = patient
        self._system_prompt = build_system_prompt(patient)

    def _build_messages(self, transcript: list[Turn], vision: VisionContext | None) -> list[dict]:
        messages: list[dict] = [{"role": "system", "content": self._system_prompt}]
        for turn in transcript:
            messages.append({"role": _ROLE_MAP[turn.role], "content": turn.text})
        if vision is not None:
            flags = ", ".join(vision.flags) if vision.flags else "none"
            messages.append(
                {
                    "role": "system",
                    "content": (
                        f"[VISION CONTEXT] Scene: {vision.label}. "
                        f"{vision.description} Flags: {flags}."
                    ),
                }
            )
        return messages

    async def respond(
        self, transcript: list[Turn], vision: VisionContext | None = None
    ) -> AgentDecision:
        messages = self._build_messages(transcript, vision)
        data = await self._client.complete_json(messages)
        return AgentDecision.model_validate(data)
