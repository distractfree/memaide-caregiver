"""Few-shot example exchanges embedded directly into the system prompt."""

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
]


def format_few_shot() -> str:
    """Render the examples as a readable block that also teaches the JSON reply format."""
    blocks = []
    for ex in FEW_SHOT_EXAMPLES:
        reply = json.dumps(
            {
                "reply_text": ex["reply_text"],
                "wants_escalation": ex["wants_escalation"],
                "handoff_ready": ex["handoff_ready"],
                "intent": ex["intent"],
            }
        )
        blocks.append(
            f"Situation: {ex['situation']}\n"
            f'Person: "{ex["patient"]}"\n'
            f"You: {reply}"
        )
    return "\n\n".join(blocks)
