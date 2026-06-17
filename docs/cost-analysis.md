# MemAide — Cost Analysis (per 5-minute call)

Estimated OpenAI API cost for a single typical 5-minute MemAide conversation.

Both `BRAIN_MODEL` and `VISION_MODEL` are `gpt-4o-mini` (see `src/memaide/config.py`).
Token counts below are measured with `tiktoken` (`o200k_base`) against the actual
prompts in this repo, not estimated.

## Pricing (gpt-4o-mini)

| | USD per 1M tokens |
|---|---|
| Input | $0.150 |
| Output | $0.600 |
| Cached input | $0.075 |

Images on `gpt-4o-mini` are billed by scaling the `gpt-4o` base-token count by **33.333×**:

- Low detail: 85 base → **2,833 tokens/image**
- High detail (1024px): 765 base → **25,500 tokens/image**

## Assumptions

| Parameter | Value | Source |
|---|---|---|
| System prompt | **889 tokens** | base + patient block + 5 few-shot examples (measured) |
| Conversation turns | 15 | ~20s/exchange over 300s |
| Avg patient utterance | 24 tok | measured sample |
| Avg agent JSON reply | 59 tok (output) | measured sample |
| Vision context msg | 39 tok | `[VISION CONTEXT]` injected into brain prompt |
| Vision frames | 42 | `VISION_INTERVAL_SECONDS = 7` → 300 / 7 |

## Key cost driver: full-transcript resend

`AgentBrain._build_messages` resends the **full system prompt + entire transcript on
every turn**, so input tokens grow each turn. Over 15 turns this compounds to
**24,255 input tokens** (not ~15 × 900). The 889-token system prompt alone is re-sent
15 times.

## Results

| Component | Input tok | Output tok | Cost |
|---|---|---|---|
| Brain (text), 15 turns | 24,255 | 885 | **$0.0042** |
| Vision — low detail (42 frames) | 122,346 | 1,680 | **$0.0194** |
| Vision — high detail (42 frames) | 1,074,360 | 1,680 | **$0.1622** |

### Total per 5-minute call

| Scenario | Cost |
|---|---|
| Text only | **~$0.004** |
| Text + vision (low detail) | **~$0.024** |
| Text + vision (high detail) | **~$0.166** |

## Takeaways

- **Vision dwarfs text.** Detail mode is the single biggest cost lever — high detail is
  ~7× the rest of the call combined. For a wearable sampling every 7s, use **low detail**;
  that lands a full call at **~2.4 cents**.
- **Prompt caching could roughly halve text cost.** OpenAI auto-caches input prompts
  >1024 tokens at 50% off. The repeated 889-token system prompt + growing transcript
  would bill the cached portion at $0.075/1M — meaningful at volume.

## Audio (M2 voice path)

The M2 voice path runs on `gpt-4o-mini-realtime-preview` (`REALTIME_MODEL`), which bills
audio as tokens at a duration-based rate.

### Audio pricing

| Audio token type | Price / 1M | Rate | $ per minute of speech |
|---|---|---|---|
| Input (patient speech) | $10.00 | 600 tok/min (1 tok / 100 ms) | **$0.0060 / min** |
| Output (agent speech) | $20.00 | 1,200 tok/min (1 tok / 50 ms) | **$0.0240 / min** |
| Cached input | $0.30 | — | re-billed context (see note) |

Output is **4× the per-minute cost of input** — twice the tokens (50 ms vs 100 ms each)
at twice the price.

### Applied to a 5-minute call

Audio cost tracks *talk time*, not call length (silence isn't billed at the speech rate).
Tying it to the 15-turn model above — agent `reply_text` ≈ 25–30 spoken words/turn,
patient ≈ 18 words/turn:

| | Speaking time | Tokens | Cost |
|---|---|---|---|
| Audio IN (patient) | ~1.5 min | ~900 | **$0.009** |
| Audio OUT (agent) | ~2.5 min | ~3,000 | **$0.060** |
| **Audio total** | ~4 min active | | **~$0.07** |

So roughly **$0.01 in / $0.06 out / ≈ $0.07 total** for audio — heavily weighted toward
output.

**Realtime context note:** unlike the M1 text path, the Realtime API keeps prior audio in
the context window and re-reads it each turn, re-billing it as input. OpenAI auto-caches
that at **$0.30/1M** (33× cheaper than fresh audio), so the re-bill adds only a cent or two
over 15 turns rather than exploding the total. Fresh speech each turn dominates.

### Full-call total (with audio)

**Low-detail vision:**

| Component | Cost |
|---|---|
| Text brain | ~$0.004 |
| Vision (low detail) | ~$0.019 |
| Audio (in + out) | ~$0.07 |
| **Full call (low-detail vision + audio)** | **~$0.09–0.10** |

**High-detail vision:**

| Component | Cost |
|---|---|
| Text brain | ~$0.004 |
| Vision (high detail) | ~$0.162 |
| Audio (in + out) | ~$0.07 |
| **Full call (high-detail vision + audio)** | **~$0.24** |

With low detail, audio is the single largest component once M2 is live. With high
detail, vision dominates the entire call.

## Other Model Options

What the call costs if the **brain (text)** *and* **vision** run on a GPT-5.4 model instead
of gpt-4o-mini. Brain token counts are identical (24,255 input / 885 output).

**Audio cannot be swapped.** There is no gpt-5.4 realtime/audio model — audio I/O only
exists on the realtime line — so audio stays on `gpt-4o-mini-realtime` (~$0.07) in every
row below.

**Text pricing (per 1M tokens):**

| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-4o-mini (current) | $0.15 | $0.075 | $0.60 |
| gpt-5.4-nano | $0.20 | $0.02 | $1.25 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 |

**Vision pricing differs by family.** gpt-4o-mini scales the base image-token count by
33.333×. The GPT-5.4 models are **patch-based** instead: 32px patches (cap 1,536),
multiplied by 1.62 (mini) or 2.46 (nano), billed at the text input rate — **no** 33×
multiplier. That makes high-detail vision dramatically cheaper on GPT-5.4. Per-frame image
tokens (42 frames/call):

| | Low (~512px, 256 patches) | High (1024px, 1,024 patches) |
|---|---|---|
| gpt-4o-mini | 2,833 tok | 25,500 tok |
| gpt-5.4-mini | 415 tok | 1,659 tok |
| gpt-5.4-nano | 630 tok | 2,519 tok |

### gpt-5.4-nano

Low-detail vision:

| Component | Cost |
|---|---|
| Brain (text), 15 turns | ~$0.0060 |
| Vision (low detail, on nano) | ~$0.008 |
| Audio (gpt-4o-mini-realtime) | ~$0.07 |
| **Full call** | **~$0.084** |

High-detail vision:

| Component | Cost |
|---|---|
| Brain (text), 15 turns | ~$0.0060 |
| Vision (high detail, on nano) | ~$0.024 |
| Audio (gpt-4o-mini-realtime) | ~$0.07 |
| **Full call** | **~$0.10** |

### gpt-5.4-mini

Low-detail vision:

| Component | Cost |
|---|---|
| Brain (text), 15 turns | ~$0.0222 |
| Vision (low detail, on mini) | ~$0.023 |
| Audio (gpt-4o-mini-realtime) | ~$0.07 |
| **Full call** | **~$0.12** |

High-detail vision:

| Component | Cost |
|---|---|
| Brain (text), 15 turns | ~$0.0222 |
| Vision (high detail, on mini) | ~$0.062 |
| Audio (gpt-4o-mini-realtime) | ~$0.07 |
| **Full call** | **~$0.15** |

**Takeaway:** the big swing is **vision, not the brain**. Because GPT-5.4 vision is
patch-based with no 33× multiplier, high-detail vision drops from ~$0.162 on gpt-4o-mini to
~$0.024 (nano) / ~$0.062 (mini). A full high-detail call on gpt-5.4-nano (~$0.10) is
actually *cheaper* than the same call on gpt-4o-mini (~$0.166) — and you get a newer
reasoning model. Audio (~$0.07, fixed) is the floor that no model choice can lower.

## Caveats

1. Token samples for patient/agent turns are representative averages; real calls vary
   with how talkative the person is and how often vision context is attached.
2. Audio costs assume ~4 minutes of active speech in a 5-minute call; quieter or chattier
   calls scale linearly with talk time.

## Sources

- [economize.cloud — gpt-4o-mini-realtime-preview pricing](https://www.economize.cloud/resources/open-ai/pricing/gpt-4o-mini-realtime-preview/)
- [OpenAI — Managing realtime costs](https://developers.openai.com/api/docs/guides/realtime-costs)
- [CallSphere — Realtime cost-per-minute math](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)
- [OpenAI — gpt-5.4-nano model](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
- [CloudPrice — gpt-5.4-mini pricing](https://cloudprice.net/models/openai-gpt-5-4-mini)
- [OpenAI — Images and vision (patch-based token calculation)](https://developers.openai.com/api/docs/guides/images-vision)
