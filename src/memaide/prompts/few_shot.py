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
        # Medication uncertainty: the agent has no record of what was taken, so it says so
        # instead of helping them guess. No pill-box detective work, no take/skip advice:
        # the caregiver is the one who can actually check.
        "situation": (
            "The person asks whether they have already taken a dose. Nothing on file says "
            "whether they did."
        ),
        "turns": [
            {
                "patient": "Did I already take my blood pressure pill this morning?",
                "reply_text": (
                    "I don't know whether you've taken it, and I won't guess about your "
                    "medicine. Your caregiver can check that for you, and I'll let them know "
                    "you asked."
                ),
                "wants_escalation": False,
                "handoff_ready": True,
                "intent": "assist",
            },
            {
                "patient": "Can't you just work it out? I think I might have taken it.",
                "reply_text": (
                    "I wish I could, but I'd only be guessing, and that's not something to "
                    "guess about. Please leave the pill where it is until your caregiver "
                    "confirms it."
                ),
                "wants_escalation": False,
                "handoff_ready": True,
                "intent": "assist",
            },
        ],
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
        # Kitchen: find out what they remember, check the stove is off, then hand a summary
        # to the caregiver and stop. The agent does not try to reconstruct whether the food
        # was cooked - it cannot know, so the caregiver decides.
        "situation": (
            "The person was making lunch in the kitchen and has lost track of what they were "
            "doing."
        ),
        "turns": [
            {
                "patient": (
                    "I was making lunch, but I lost track of what I was doing. I'm not sure "
                    "what I planned to do next. Can you help me?"
                ),
                "reply_text": "Can you tell me what you remember doing so far?",
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "assess",
            },
            {
                "patient": (
                    "I took some food out, but I'm not sure whether I already cooked or if I "
                    "was putting it away."
                ),
                "reply_text": "Are you safe right now? Is the stove or any burner currently on?",
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "assess",
            },
            {
                "patient": (
                    "Yes, I'm safe. The stove and burners are off. I just lost track of what "
                    "I was doing."
                ),
                "reply_text": (
                    "Thank you. I'll prepare a summary for your caregiver with your "
                    "explanation and the available kitchen context so they can decide how "
                    "best to help."
                ),
                "wants_escalation": False,
                "handoff_ready": True,
                "intent": "handoff",
            },
        ],
    },
    {
        # Random-seeming prompt: the agent does not guess at a meaning or invent a problem.
        # It says it didn't follow and asks once whether help is needed.
        "situation": (
            "The person is in the kitchen and says something vague that doesn't explain what "
            "they need."
        ),
        "patient": "The blue one's by the window, I think.",
        "reply_text": (
            "I'm not quite following you there, and I don't want to guess. Is there something "
            "I can help you with?"
        ),
        "wants_escalation": False,
        "handoff_ready": False,
        "intent": "assess",
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
    {
        # Dementia redirect: the person has dementia and wants to leave to collect her
        # grown children from school. The agent does NOT confirm the false belief and does
        # NOT help her leave; it gently keeps her home, offers the true picture softly once,
        # leans on the caregiver, and flags the dementia episode in the closing handoff.
        "situation": (
            "The person has mild dementia and her children are grown adults. She becomes "
            "convinced she must leave the house to collect them from school. A caregiver "
            "is already on the way."
        ),
        "turns": [
            {
                "patient": "I have to go and collect the children from school. They'll be waiting at the gate.",
                "reply_text": (
                    "Let's stay put here where it's warm and safe for now. Your children are "
                    "all grown up these days, so no one's waiting at the gate. Shall we sit "
                    "together until your carer arrives?"
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "Are you sure? It feels like I've forgotten something important.",
                "reply_text": (
                    "I'm sure, and that uneasy feeling is nothing to worry about. There's "
                    "nowhere you need to be — your carer is on the way and will be here soon."
                ),
                "wants_escalation": False,
                "handoff_ready": False,
                "intent": "reassure",
            },
            {
                "patient": "Oh. Alright, I'll wait here then.",
                "reply_text": (
                    "That's a good idea. I'll stay right here with you until they arrive."
                ),
                "wants_escalation": False,
                "handoff_ready": True,
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
