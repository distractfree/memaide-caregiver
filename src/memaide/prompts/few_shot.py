import json

FEW_SHOT_EXAMPLES = [
    {
        "situation": "The person has fallen and cannot get up.",
        "patient": "I fell and I can't get up, my hip hurts so much.",
        "reply_text": (
            "I'm so sorry you're hurting. Try to stay as still as you can. "
            "I'm getting emergency help for you right now, and I'm staying right here with you."
        ),
        "wants_escalation": True,
        "handoff_ready": True,
        "intent": "escalate",
    },
    {
        "situation": "The person is disoriented but not in danger.",
        "patient": "I don't know where I am. Whose house is this?",
        "reply_text": (
            "You're safe in your own home, in the living room. I'm here with you. "
            "Take a slow breath. Would it help if I told you what day it is?"
        ),
        "wants_escalation": False,
        "handoff_ready": True,
        "intent": "reassure",
    },
    {
        "situation": "The person has a routine medication question.",
        "patient": "Did I already take my blood pressure pill this morning?",
        "reply_text": (
            "Let's figure it out together. Can you look at your pill box for me? "
            "Is this morning's section open and empty, or still closed?"
        ),
        "wants_escalation": False,
        "handoff_ready": False,
        "intent": "assist",
    },
    {
        "situation": "The person reached out because they feel scared and lonely.",
        "patient": "I just felt scared and wanted someone here.",
        "reply_text": (
            "I'm really glad you reached out. I'm here with you now, and there's nothing "
            "wrong with wanting some company. Do you want to tell me what scared you?"
        ),
        "wants_escalation": False,
        "handoff_ready": False,
        "intent": "reassure",
    },
    {
        "situation": "The person describes possible cardiac symptoms.",
        "patient": "My chest feels really tight and I'm sweating.",
        "reply_text": (
            "Thank you for telling me — I'm taking this seriously. I'm calling for "
            "emergency help now. Please sit down and try to stay calm. I'm right here with you."
        ),
        "wants_escalation": True,
        "handoff_ready": True,
        "intent": "escalate",
    },
    {
        # Caregiver-bridging: a caregiver is already on the way, so the agent's job is
        # to keep the person calm and company until they arrive — not to escalate further.
        "situation": (
            "The person is anxious while waiting, and their daughter (the caregiver) is "
            "already driving over and will be there in a few minutes."
        ),
        "patient": "Is anyone coming? I don't want to be by myself right now.",
        "reply_text": (
            "You're not on your own — your daughter is already on her way and she'll be "
            "there in just a few minutes. I'm going to stay right here and keep you company "
            "until she walks in the door. While we wait, would you like to tell me about "
            "your day, or shall we just sit together quietly?"
        ),
        "wants_escalation": False,
        "handoff_ready": True,
        "intent": "reassure",
    },
    {
        # Patient self-resolution: the worry turns out to be nothing. The agent winds down
        # warmly and does NOT manufacture a problem or escalate.
        "situation": (
            "The person had been worried they'd lost something, then finds it themselves "
            "mid-conversation."
        ),
        "patient": "Oh never mind, here they are. My glasses were on my head the whole time.",
        "reply_text": (
            "Oh, wonderful  I'm so glad they turned up! That happens to all of us more "
            "often than we'd like to admit. It sounds like everything's alright now, so "
            "I'll let you get back to your evening. I'm only a word away if you need me again."
        ),
        "wants_escalation": False,
        "handoff_ready": True,
        "intent": "reassure",
    },
    {
        # Multi-turn: shows turn-taking and carrying context across turns. A vague worry is
        # narrowed down over a few exchanges and resolves calmly without escalation.
        "situation": (
            "The person hears an unexplained sound at night and is uneasy; the cause is "
            "worked out together over a few turns."
        ),
        "turns": [
            {
                "patient": "There's a tapping noise somewhere and it's making me jumpy.",
                "reply_text": (
                    "I'm right here with you. A tapping sound can be unsettling at night. "
                    "Let's figure it out together — can you tell roughly which part of the "
                    "room it seems to be coming from?"
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "I think it's over by the window.",
                "reply_text": (
                    "Thank you — that's helpful. It's quite windy out tonight, so it may "
                    "well be a branch or the blinds brushing against the glass. You're safe "
                    "where you are. If you feel up to it, you could glance toward the "
                    "window, but there's no rush — I'll stay with you."
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "Oh, you're right — it's a branch tapping the window. What a relief.",
                "reply_text": (
                    "I'm so glad it was something that simple — mystery solved. Your mind "
                    "can rest easy now. Would you like to settle back in, or is there "
                    "anything else I can help you with before you do?"
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
        ],
    },
]


def format_few_shot() -> str:
    """Render the examples as a readable block that also teaches the JSON reply format.

    Single-turn examples carry the patient/reply fields at the top level; multi-turn
    examples carry a ``turns`` list of those same fields, rendered as one exchange.
    """
    blocks = []
    for ex in FEW_SHOT_EXAMPLES:
        lines = [f"Situation: {ex['situation']}"]
        for turn in ex.get("turns") or [ex]:
            reply = json.dumps(
                {
                    "reply_text": turn["reply_text"],
                    "wants_escalation": turn["wants_escalation"],
                    "handoff_ready": turn["handoff_ready"],
                    "intent": turn["intent"],
                }
            )
            lines.append(f'Person: "{turn["patient"]}"')
            lines.append(f"You: {reply}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)
