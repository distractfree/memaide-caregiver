"""Manual check: run SituationSummarizer against the real model on sample escalations.

Prints the {{3}} phrase each sample would put in the caregiver WhatsApp, inside the template
sentence it lands in, so you can see whether it reads correctly there. The last two samples
must print the fallback unchanged: a vision-only escalation has no patient speech to describe,
and the summarizer is never allowed to invent one. Needs a working OPENAI_API_KEY; on the
droplet:

    set -a; . /etc/memaide/memaide.env; set +a
    .venv/bin/python scripts/alert_phrase_smoke.py
"""

import asyncio
from datetime import datetime, timedelta, timezone

from memaide.io.openai_client import OpenAIClient
from memaide.notify.alert_summary import SituationSummarizer
from memaide.notify.escalation_alert import situation_phrase
from memaide.schemas import Role, Turn, VisionContext

T0 = datetime(2026, 7, 26, 19, 5, tzinfo=timezone.utc)


def turns(pairs):
    return [
        Turn(role=role, text=text, ts=T0 + timedelta(seconds=20 * i))
        for i, (role, text) in enumerate(pairs)
    ]


FALL = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "I slipped getting up and I'm on the floor. I can't get myself up."),
    (Role.AGENT, "Try to stay still. I'm getting help for you now."),
    (Role.PATIENT, "My hip is really hurting."),
])

BREATHING = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "I can't catch my breath. It started while I was on the stairs."),
])

KITCHEN = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "I've burnt my hand on the pan and it's blistering."),
])

# No patient speech: the escalation came from vision alone. Must return the fallback.
VISION_ONLY = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
])

SAMPLES = [
    ("fall", FALL,
     VisionContext(description="An older adult lying on a hallway floor.",
                   label="person_on_floor"),
     situation_phrase(["distress_keyword"])),
    ("breathing", BREATHING, None, situation_phrase(["distress_keyword"])),
    ("kitchen burn", KITCHEN,
     VisionContext(description="An older adult at a stove holding one hand.", label="kitchen"),
     situation_phrase(["distress_keyword"])),
    ("vision only (expect fallback)", VISION_ONLY,
     VisionContext(description="An older adult lying on a kitchen floor, not moving.",
                   label="person_on_floor"),
     situation_phrase(["vision:person_on_floor"])),
    ("no transcript (expect fallback)", [], None, situation_phrase([])),
]


async def main() -> None:
    summarizer = SituationSummarizer(OpenAIClient())
    for name, transcript, scene, fallback in SAMPLES:
        phrase = await summarizer.phrase(transcript, scene, fallback)
        used_fallback = " [FALLBACK]" if phrase == fallback else ""
        print(f"\n--- {name}{used_fallback}")
        print(f"  {{{{3}}}} = {phrase!r}")
        print(f"  reads as: We are detecting signs of {phrase}.")


if __name__ == "__main__":
    asyncio.run(main())
