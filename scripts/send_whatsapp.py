"""Send a real WhatsApp message via the Meta Cloud API to verify credentials.

Run from the repo root. Reads WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TO
from the environment / .env via memaide.config.

    # First contact on a fresh test number MUST be an approved template:
    python scripts/send_whatsapp.py --template hello_world

    # Free-form text only works within 24h of the recipient messaging your number:
    python scripts/send_whatsapp.py --text "MemAide test message"

    # Override the recipient (must be a verified number on the test WABA):
    python scripts/send_whatsapp.py --to +15551234567 --template hello_world

Exits non-zero on failure.
"""

import argparse
import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config
from memaide.notify.whatsapp import WhatsAppSender


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a test WhatsApp message.")
    parser.add_argument("--to", default=config.WHATSAPP_TO, help="recipient (E.164, e.g. +15551234567)")
    parser.add_argument("--text", help="free-form text (only within the 24h session window)")
    parser.add_argument("--template", default="hello_world", help="approved template name for first contact")
    parser.add_argument("--lang", default="en_US", help="template language code")
    args = parser.parse_args()

    missing = [
        name
        for name, val in (
            ("WHATSAPP_TOKEN", config.WHATSAPP_TOKEN),
            ("WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID),
        )
        if not val
    ]
    if missing:
        print(f"FAIL: missing env: {', '.join(missing)} (check your .env).")
        return 1
    if not args.to:
        print("FAIL: no recipient — set WHATSAPP_TO in .env or pass --to.")
        return 1

    sender = WhatsAppSender(config.WHATSAPP_TOKEN, config.WHATSAPP_PHONE_NUMBER_ID)
    if args.text:
        print(f"Sending text to {args.to}...")
        ok = sender.send_text(args.to, args.text)
    else:
        print(f"Sending template '{args.template}' ({args.lang}) to {args.to}...")
        ok = sender.send_template(args.to, args.template, args.lang)

    if ok:
        print("OK: WhatsApp API accepted the message. Check the recipient phone.")
        return 0
    print("FAIL: send rejected - see the logged HTTP error above.")
    return 1


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
