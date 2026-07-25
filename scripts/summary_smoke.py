"""Manual check: run SessionSummarizer against the real model on three sample sessions.

Prints the caregiver summary for a confusion episode, an escalated fall, and a session where
the patient said nothing usable. The third should print None — the summarizer declines rather
than inventing a reason for help. Needs a working OPENAI_API_KEY; on the droplet:

    set -a; . /etc/memaide/memaide.env; set +a
    .venv/bin/python scripts/summary_smoke.py
"""

import asyncio
from datetime import datetime, timedelta, timezone

from memaide.agent.summarizer import SessionSummarizer
from memaide.io.openai_client import OpenAIClient
from memaide.schemas import HandoffType, Role, SessionRecord, Turn

T0 = datetime(2026, 7, 24, 14, 30, tzinfo=timezone.utc)


def turns(pairs):
    return [
        Turn(role=role, text=text, ts=T0 + timedelta(seconds=20 * i))
        for i, (role, text) in enumerate(pairs)
    ]


CONFUSION = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "I don't know where I am. Where's my mother? She was just here."),
    (Role.AGENT, "You're at home, in your own bedroom. It's Friday afternoon."),
    (Role.PATIENT, "No, I have to go find her. She'll be waiting for me at the school."),
    (Role.AGENT, "Let's stay right here on the bed for a minute. Your daughter Anna is on her way over."),
    (Role.PATIENT, "Anna? Is Anna coming? Okay. I'll wait then. My legs are tired anyway."),
])

FALL = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "I slipped in the bathroom. I'm on the floor and I can't get up."),
    (Role.AGENT, "I'm getting your caregiver now. Does anything hurt?"),
    (Role.PATIENT, "My hip hurts when I move it. My head is fine, I didn't hit it."),
    (Role.AGENT, "Stay still for me. Help is coming."),
])

SPARSE = turns([
    (Role.AGENT, "Hi, I'm here to help. Can you tell me what's wrong?"),
    (Role.PATIENT, "Hello? Hello?"),
])


def record(transcript, scene, escalated):
    return SessionRecord(
        id="smoke",
        patient_id="p1",
        started_at=T0,
        ended_at=T0 + timedelta(minutes=3),
        handoff_type=HandoffType.PATIENT_ENDED,
        transcript=transcript,
        final_scene_label=scene,
        escalated=escalated,
    )


async def main():
    summarizer = SessionSummarizer(OpenAIClient())
    cases = [
        ("confusion episode", record(CONFUSION, "bedroom", False), "patient_ended"),
        ("fall, escalated", record(FALL, "bathroom_floor", True), "patient_ended"),
        ("nothing said", record(SPARSE, "living_room", False), "disconnected"),
    ]
    for name, rec, outcome in cases:
        summary = await summarizer.summarize(rec, outcome)
        print(f"\n=== {name} ({outcome}) ===")
        for turn in rec.transcript:
            print(f"  {turn.role.value}: {turn.text}")
        print(f"summary: {summary!r}")
        print(f"chars:   {len(summary) if summary else 0}")


if __name__ == "__main__":
    asyncio.run(main())
