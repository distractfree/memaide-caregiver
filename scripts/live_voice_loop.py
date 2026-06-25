"""Talk to MemAide live from your own machine (mic in, speakers out) — low latency.

STREAMING STT path: the mic streams continuously to the OpenAI realtime transcription
websocket (model = config.STT_MODEL) and SERVER-SIDE VAD detects when you stop talking,
so the final transcript lands ~0.2-0.3s after you finish instead of after a buffered
upload. Each finalized utterance runs a real brain turn; the reply is streamed back via
TTS (first audio plays as soon as the first chunk arrives). The mic stays open while the
agent speaks: local energy detection cuts the agent off if you start talking (barge-in).

NOTE on architecture: this drives the real AgentBrain + AgentSession + StreamingTTS, but
the listen side uses the realtime transcription websocket directly rather than the
production VoiceLoop/SpeechToText pipeline. That is a deliberate latency experiment; the
product's safety-critical reasoning still lives in the text brain (escalation, prompts).

TIP: use HEADPHONES. With the mic open during playback, speaker output can leak into the
mic. The barge-in bar is measured from the agent's own level (greeting), but headphones
remove the leak entirely; on speakers, raise BARGE_MARGIN if it self-triggers.

Requires `sounddevice` + `numpy` in the venv:
    .venv\\Scripts\\python -m pip install sounddevice numpy

Run from the repo root:
    .venv\\Scripts\\python scripts/live_voice_loop.py
"""

import asyncio
import base64
import sys
import time
from pathlib import Path

# Make `memaide` importable without an editable install (src/ layout).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import numpy as np
import sounddevice as sd
from openai import AsyncOpenAI

from memaide import config
from memaide.agent.brain import AgentBrain
from memaide.agent.session import AgentSession
from memaide.audio.tts import TextToSpeech
from memaide.io.openai_client import OpenAIClient
from memaide.schemas import PatientContext

SAMPLE_RATE = config.AUDIO_SAMPLE_RATE  # 24000 Hz, matches TTS "pcm" output + realtime pcm
CHANNELS = 1
BLOCK = 480                  # 20 ms frames at 24 kHz
THRESHOLD_FACTOR = 4.0       # idle speech RMS must exceed ambient * this
THRESHOLD_FLOOR = 180.0      # but never trip below this (int16 RMS)
ECHO_PERCENTILE = 95         # treat this percentile of agent-playback frames as its level
BARGE_MARGIN = 1.5           # your voice must exceed agent_level * this to interrupt
BARGE_ONSET_FRAMES = 5       # sustained loud frames to confirm a barge-in (~100 ms)
SERVER_VAD_SILENCE_MS = 400  # server-side end-of-speech silence (replaces local hangover)
TTS_CHUNK = 4800             # bytes (~0.1 s) per streamed TTS chunk


def _rms(block: np.ndarray) -> float:
    return float(np.sqrt(np.mean(block.astype(np.float32) ** 2)))


class Mic:
    """Persistent mic stream; pushes 20 ms int16 frames into an asyncio.Queue."""

    def __init__(self):
        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16",
            blocksize=BLOCK, callback=self._cb,
        )
        self._loop = None
        self.aq: asyncio.Queue | None = None

    def _cb(self, indata, _frames, _time, status):
        if status:
            print(f"  (audio status: {status})", file=sys.stderr)
        loop = self._loop
        if loop is not None:
            loop.call_soon_threadsafe(self.aq.put_nowait, indata.copy().reshape(-1))

    def start(self, loop):
        self._loop = loop
        self.aq = asyncio.Queue()
        self._stream.start()

    def drain(self):
        while self.aq and not self.aq.empty():
            self.aq.get_nowait()

    def close(self):
        self._stream.stop()
        self._stream.close()


def calibrate_threshold(seconds: float = 0.7) -> float:
    """Sample ambient noise and derive a speech-detection RMS threshold (sync, sd.rec)."""
    audio = sd.rec(
        int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16"
    )
    sd.wait()
    return max(_rms(audio.reshape(-1)) * THRESHOLD_FACTOR, THRESHOLD_FLOOR)


async def calibrate_echo(mic: Mic, pcm: bytes) -> float:
    """Play agent audio and measure how loud it is AT THE MIC (you stay quiet).

    Returns a high percentile of the per-frame RMS heard during playback (the agent's own
    level leaking back in), so the barge-in bar can be set above it. 0.0 if none captured.
    """
    audio = np.frombuffer(pcm, dtype="<i2")
    duration = len(audio) / SAMPLE_RATE
    mic.drain()
    sd.play(audio, samplerate=SAMPLE_RATE)
    end = time.monotonic() + duration + 0.1
    levels: list[float] = []
    while time.monotonic() < end:
        try:
            frame = await asyncio.wait_for(mic.aq.get(), timeout=0.1)
        except asyncio.TimeoutError:
            continue
        levels.append(_rms(frame))
    sd.stop()
    return float(np.percentile(levels, ECHO_PERCENTILE)) if levels else 0.0


def _print_latency(t: dict) -> None:
    """Per-stage breakdown from end-of-speech (server VAD) to first audio out."""
    t0, stt, brain, tts = t.get("t0"), t.get("stt"), t.get("brain"), t.get("tts")
    if not all((t0, stt, brain, tts)):
        return
    print(
        f"  [latency] STT-finalize {stt - t0:.2f}s + brain {brain - stt:.2f}s"
        f" + TTS {tts - brain:.2f}s = {tts - t0:.2f}s to first audio (from end of speech)"
    )


class StreamingTTS:
    """Streams TTS audio, playing each chunk as it arrives; aborts on a barge-in event."""

    def __init__(self, client, barge_event: asyncio.Event, timings: dict,
                 model: str = config.TTS_MODEL, voice: str = config.TTS_VOICE):
        self._client = client
        self._barge = barge_event
        self._t = timings
        self._model = model
        self._voice = voice

    async def play(self, text: str) -> bool:
        """Speak ``text``; return True if interrupted by a barge-in."""
        out = sd.OutputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16")
        out.start()
        remainder = b""
        first = True
        interrupted = False
        try:
            async with self._client.audio.speech.with_streaming_response.create(
                model=self._model, voice=self._voice, input=text, response_format="pcm",
            ) as resp:
                async for chunk in resp.iter_bytes(TTS_CHUNK):
                    if first:
                        self._t["tts"] = time.monotonic()
                        _print_latency(self._t)
                        first = False
                    if self._barge.is_set():
                        interrupted = True
                        break
                    data = remainder + chunk
                    if len(data) % 2:
                        remainder, data = data[-1:], data[:-1]
                    else:
                        remainder = b""
                    if data:
                        out.write(np.frombuffer(data, dtype="<i2").reshape(-1, 1))
        finally:
            out.abort() if interrupted else out.stop()
            out.close()
        return interrupted


async def warm_up(brain_client: OpenAIClient, tts_client) -> None:
    """Fire tiny throwaway brain + TTS requests so the first turn isn't cold."""

    async def warm_brain():
        try:
            await brain_client.complete_json(
                [{"role": "user", "content": 'Reply with {"ok": true}.'}], max_retries=1
            )
        except Exception:  # noqa: BLE001 - best effort
            pass

    async def warm_tts():
        try:
            async with tts_client.audio.speech.with_streaming_response.create(
                model=config.TTS_MODEL, voice=config.TTS_VOICE,
                input="ok", response_format="pcm",
            ) as resp:
                async for _ in resp.iter_bytes(TTS_CHUNK):
                    break
        except Exception:  # noqa: BLE001
            pass

    await asyncio.gather(warm_brain(), warm_tts())


def _transcription_session() -> dict:
    return {
        "type": "transcription",
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                "transcription": {"model": config.STT_MODEL, "language": "en"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": SERVER_VAD_SILENCE_MS,
                },
            }
        },
    }


async def open_realtime(client):
    """Open the realtime transcription websocket and configure server-VAD transcription."""
    cm = client.realtime.connect(extra_query={"intent": "transcription"})
    conn = await cm.enter()
    await conn.send({"type": "session.update", "session": _transcription_session()})
    return conn


def _b64_pcm(frame: np.ndarray) -> str:
    return base64.b64encode(frame.astype("<i2").tobytes()).decode("ascii")


async def main() -> int:
    if not config.OPENAI_API_KEY:
        print("FAIL: OPENAI_API_KEY is not set (check your .env).")
        return 1

    print(f"Input device:  {sd.query_devices(kind='input')['name']}")
    print(f"Output device: {sd.query_devices(kind='output')['name']}")

    client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
    patient = PatientContext(patient_id="local-test", name="Tester")
    brain_client = OpenAIClient()
    brain = AgentBrain(brain_client, patient)
    session = AgentSession(brain, patient)
    batch_tts = TextToSpeech(client, response_format="pcm")  # greeting / echo calibration

    T: dict[str, float] = {}
    barge_event = asyncio.Event()
    streaming_tts = StreamingTTS(client, barge_event, T)

    # Warm the brain/TTS connections and open the realtime socket concurrently with the
    # calibration window so all that setup cost is hidden.
    warm = asyncio.create_task(warm_up(brain_client, client))
    rt_ready = asyncio.create_task(open_realtime(client))

    print("\nWarming up + calibrating ambient noise (stay quiet)...")
    threshold = await asyncio.to_thread(calibrate_threshold)
    print(f"  speech threshold (RMS) = {threshold:.0f}")

    loop = asyncio.get_running_loop()
    mic = Mic()
    mic.start(loop)

    conn = None
    try:
        # Greeting + measure the agent's own level at the mic (stay quiet for it).
        opening = session.start()
        print(f"\nAgent: {opening.text}")
        print("  (measuring agent volume -- please stay quiet during the greeting)")
        echo = await calibrate_echo(mic, await batch_tts.synthesize(opening.text))
        barge_threshold = max(echo * BARGE_MARGIN, threshold)
        print(f"  agent level at mic (RMS) = {echo:.0f} -> barge-in threshold = {barge_threshold:.0f}")

        await warm
        try:
            conn = await rt_ready
        except Exception as exc:  # noqa: BLE001 - surface a clear message
            print(f"\nFAIL: could not open realtime transcription socket: {exc}")
            return 1
        print("  (models warm, realtime STT connected)")

        state = {"mode": "listening", "last_speech": time.monotonic()}
        transcripts: asyncio.Queue = asyncio.Queue()

        async def mic_router():
            """Stream mic audio to the realtime socket while listening; detect barge-in
            (local energy) while the agent speaks."""
            loud_run = 0
            captured: list[np.ndarray] = []
            while True:
                frame = await mic.aq.get()
                if state["mode"] == "listening":
                    await conn.send({"type": "input_audio_buffer.append", "audio": _b64_pcm(frame)})
                    continue
                # speaking -> watch for the patient cutting in
                if _rms(frame) >= barge_threshold:
                    loud_run += 1
                    captured.append(frame)
                    if loud_run >= BARGE_ONSET_FRAMES:
                        barge_event.set()
                        state["mode"] = "listening"
                        for f in captured:  # don't lose the start of the interruption
                            await conn.send({"type": "input_audio_buffer.append", "audio": _b64_pcm(f)})
                        loud_run, captured = 0, []
                else:
                    loud_run, captured = 0, []

        async def receive_loop():
            async for event in conn:
                et = getattr(event, "type", "")
                if et == "input_audio_buffer.speech_stopped":
                    T["t0"] = time.monotonic()
                elif et == "conversation.item.input_audio_transcription.delta":
                    print(getattr(event, "delta", ""), end="", flush=True)
                elif et == "conversation.item.input_audio_transcription.completed":
                    T["stt"] = time.monotonic()
                    text = getattr(event, "transcript", "") or ""
                    print(f"\nYou: {text}")
                    await transcripts.put(text)
                elif et == "conversation.item.input_audio_transcription.failed":
                    print("  (STT failed for that utterance)")
                elif et == "error":
                    print(f"  (realtime error: {getattr(event, 'error', event)})")

        router_task = asyncio.create_task(mic_router())
        recv_task = asyncio.create_task(receive_loop())

        mic.drain()  # drop ambient backlog captured during calibration
        print("\n--- Streaming STT + barge-in. Just talk; pause to send. Ctrl+C to quit. ---")
        try:
            while True:
                text = await transcripts.get()
                if not text.strip():
                    continue
                now = time.monotonic()
                turn = await session.handle_patient_input(
                    text, vision=None, seconds_since_last_speech=now - state["last_speech"]
                )
                state["last_speech"] = now
                T["brain"] = time.monotonic()
                print(f"\nAgent: {turn.text}")
                decision = session.last_escalation
                if decision is not None and decision.escalate:
                    print(f"  ** ESCALATION: {decision.reason} (by {decision.triggered_by}) **")

                state["mode"] = "speaking"
                barge_event.clear()
                interrupted = await streaming_tts.play(turn.text)
                state["mode"] = "listening"
                if interrupted:
                    print("  (you interrupted)")
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        finally:
            router_task.cancel()
            recv_task.cancel()
    finally:
        if conn is not None:
            await conn.close()
        mic.close()

    print("\nBye.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\nInterrupted.")
