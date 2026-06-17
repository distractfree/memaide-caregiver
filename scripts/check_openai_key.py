"""Quick check that OPENAI_API_KEY is set and accepted by the API.

Run from the repo root:

    python scripts/check_openai_key.py

Reads the key from the environment / .env via memaide.config, then asks the
model a short question ("What color is the sky?") and prints its reply. Exits
non-zero on failure.
"""

import sys
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from memaide import config


def main() -> int:
    if not config.OPENAI_API_KEY:
        print("FAIL: OPENAI_API_KEY is not set (check your .env or environment).")
        return 1

    masked = config.OPENAI_API_KEY[:7] + "..." + config.OPENAI_API_KEY[-4:]
    print(f"Found OPENAI_API_KEY ({masked}). Calling the API...")

    try:
        from openai import OpenAI

        client = OpenAI(api_key=config.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=config.BRAIN_MODEL,
            messages=[{"role": "user", "content": "What color is the sky?"}],
        )
    except Exception as exc:  # noqa: BLE001 - report any failure to the user
        print(f"FAIL: API call rejected the key or errored: {exc}")
        return 1

    reply = resp.choices[0].message.content
    print(f"OK: key works. Model replied: {reply}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
