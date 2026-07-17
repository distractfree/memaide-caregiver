export type LatestAiFrameImage = {
  mime: "image/jpeg";
  b64: string;
};

export type LatestAiFrameVision = {
  description: string | null;
  label: string | null;
  flags: string[];
  advisoryFlags: string[];
};

export interface LatestAiFrame {
  aiSessionId: string;
  patientId: string;
  /** Sequence and timestamps describe the latest callback, including vision-only updates. */
  seq: number;
  capturedAt: string;
  receivedAt: string;
  /** The latest actual JPEG remains available when the newest callback has no image. */
  image: LatestAiFrameImage | null;
  imageUpdated: boolean;
  imageSeq: number | null;
  imageCapturedAt: string | null;
  vision: LatestAiFrameVision;
}

export type LatestAiFrameInput = Omit<
  LatestAiFrame,
  "image" | "imageUpdated" | "imageSeq" | "imageCapturedAt"
> & {
  image?: LatestAiFrameImage | null;
};

export type LatestAiFrameAcceptance =
  | { accepted: true; frame: LatestAiFrame; previous: LatestAiFrame | null }
  | { accepted: false; reason: "duplicate" | "out_of_order"; frame: LatestAiFrame };

type StoredFrame = {
  frame: LatestAiFrame;
  updatedAtMs: number;
};

const frames = new Map<string, StoredFrame>();

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cacheTtlMs() {
  return positiveInteger(process.env.AI_FRAME_CACHE_TTL_SECONDS, 300) * 1000;
}

function maxCachedSessions() {
  return positiveInteger(process.env.AI_FRAME_CACHE_MAX_SESSIONS, 50);
}

function cloneVision(vision: LatestAiFrameVision): LatestAiFrameVision {
  return {
    description: vision.description,
    label: vision.label,
    flags: [...vision.flags],
    advisoryFlags: [...vision.advisoryFlags],
  };
}

function copyFrame(frame: LatestAiFrame): LatestAiFrame {
  return {
    ...frame,
    image: frame.image ? { ...frame.image } : null,
    vision: cloneVision(frame.vision),
  };
}

function isExpired(stored: StoredFrame, now: number) {
  return now - stored.updatedAtMs >= cacheTtlMs();
}

export function clearExpiredFrames(now = Date.now()): number {
  let removed = 0;
  for (const [sessionId, stored] of frames) {
    if (isExpired(stored, now)) {
      frames.delete(sessionId);
      removed += 1;
    }
  }
  return removed;
}

function evictOldestFrames() {
  const maxSessions = maxCachedSessions();
  while (frames.size >= maxSessions) {
    let oldest: [string, StoredFrame] | null = null;
    for (const entry of frames) {
      if (!oldest || entry[1].updatedAtMs < oldest[1].updatedAtMs) {
        oldest = entry;
      }
    }
    if (!oldest) return;
    frames.delete(oldest[0]);
  }
}

export function acceptLatestFrame(input: LatestAiFrameInput): LatestAiFrameAcceptance {
  const now = Date.now();
  clearExpiredFrames(now);

  const existing = frames.get(input.aiSessionId);
  if (existing) {
    if (input.seq === existing.frame.seq) {
      return { accepted: false, reason: "duplicate", frame: copyFrame(existing.frame) };
    }
    if (input.seq < existing.frame.seq) {
      return { accepted: false, reason: "out_of_order", frame: copyFrame(existing.frame) };
    }
  } else {
    evictOldestFrames();
  }

  const prior = existing ? copyFrame(existing.frame) : null;
  const hasNewImage = Boolean(input.image);
  const next: LatestAiFrame = {
    aiSessionId: input.aiSessionId,
    patientId: input.patientId,
    seq: input.seq,
    capturedAt: input.capturedAt,
    receivedAt: input.receivedAt,
    image: hasNewImage ? { ...input.image! } : prior?.image ?? null,
    imageUpdated: hasNewImage,
    imageSeq: hasNewImage ? input.seq : prior?.imageSeq ?? null,
    imageCapturedAt: hasNewImage ? input.capturedAt : prior?.imageCapturedAt ?? null,
    vision: cloneVision(input.vision),
  };

  frames.set(input.aiSessionId, { frame: next, updatedAtMs: now });
  return { accepted: true, frame: copyFrame(next), previous: prior };
}

export function getLatestFrame(aiSessionId: string): LatestAiFrame | null {
  const stored = frames.get(aiSessionId);
  if (!stored) return null;
  if (isExpired(stored, Date.now())) {
    frames.delete(aiSessionId);
    return null;
  }
  return copyFrame(stored.frame);
}

export function deleteLatestFrame(aiSessionId: string): void {
  frames.delete(aiSessionId);
}

/** Restores a frame only when a failed callback has not been superseded. */
export function restoreLatestFrameAfterFailedAcceptance(
  aiSessionId: string,
  acceptedSeq: number,
  previous: LatestAiFrame | null
): void {
  const current = frames.get(aiSessionId);
  if (!current || current.frame.seq !== acceptedSeq) return;

  if (previous) {
    frames.set(aiSessionId, { frame: copyFrame(previous), updatedAtMs: Date.now() });
  } else {
    frames.delete(aiSessionId);
  }
}

export function resetLatestFrameStoreForTests(): void {
  frames.clear();
}
