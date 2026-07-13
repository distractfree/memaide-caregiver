import { describe, it, expect, afterEach } from "vitest";
import {
  computeJoinability,
  isTerminalStatus,
  getStaleMinutes,
} from "../modules/ai-sessions/ai-session.lifecycle";

const RECENT = new Date().toISOString();
const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

describe("AI session joinability", () => {
  afterEach(() => {
    delete process.env.AI_SESSION_STALE_MINUTES;
  });

  it("a recent active session is joinable and shows Active", () => {
    const result = computeJoinability({
      status: "active",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: null,
      metadata: null,
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(true);
    expect(result.joinabilityReason).toBe("live");
    expect(result.displayStatus).toBe("Active");
  });

  it("a stale active session is not joinable and shows Stale", () => {
    const result = computeJoinability({
      status: "active",
      startedAt: OLD,
      updatedAt: OLD,
      endedAt: null,
      metadata: null,
      lastMessageAt: OLD,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("stale");
    expect(result.displayStatus).toBe("Stale");
  });

  it("a resolved session is terminal, not joinable, shows Resolved", () => {
    const result = computeJoinability({
      status: "resolved",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: RECENT,
      metadata: null,
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("terminal_status");
    expect(result.displayStatus).toBe("Resolved");
  });

  it("a start_failed session is registration_failed, not joinable, shows Failed", () => {
    const result = computeJoinability({
      status: "start_failed",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: RECENT,
      metadata: { registrationFailed: true },
      lastMessageAt: null,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("registration_failed");
    expect(result.displayStatus).toBe("Failed");
  });

  it("a superseded session is not joinable and shows Ended", () => {
    const result = computeJoinability({
      status: "cancelled",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: RECENT,
      metadata: { supersededBy: "new-session", supersededReason: "superseded_by_new_session" },
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("superseded");
    expect(result.displayStatus).toBe("Ended");
  });

  it("an endedAt session (even with a live status) is not joinable and shows Ended", () => {
    const result = computeJoinability({
      status: "active",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: RECENT,
      metadata: null,
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("ended");
    expect(result.displayStatus).toBe("Ended");
  });

  it("an escalated (emergency_suggested) session stays joinable when recent and live", () => {
    const result = computeJoinability({
      status: "emergency_suggested",
      startedAt: RECENT,
      updatedAt: RECENT,
      emergencySuggestedAt: RECENT,
      endedAt: null,
      metadata: null,
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(true);
    expect(result.joinabilityReason).toBe("live");
    expect(result.displayStatus).toBe("Active");
  });

  it("a caregiver_joined session is live but not joinable (already joined)", () => {
    const result = computeJoinability({
      status: "caregiver_joined",
      startedAt: RECENT,
      updatedAt: RECENT,
      caregiverJoinedAt: RECENT,
      endedAt: null,
      metadata: null,
      lastMessageAt: RECENT,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("not_live");
    expect(result.displayStatus).toBe("Active");
  });

  it("a zero-message freshly-started session (starting) is not yet joinable", () => {
    const result = computeJoinability({
      status: "starting",
      startedAt: RECENT,
      updatedAt: RECENT,
      endedAt: null,
      metadata: null,
      lastMessageAt: null,
    });
    expect(result.isJoinable).toBe(false);
    expect(result.joinabilityReason).toBe("not_live");
  });

  it("respects a configurable stale window", () => {
    process.env.AI_SESSION_STALE_MINUTES = "120";
    expect(getStaleMinutes()).toBe(120);
    const result = computeJoinability({
      status: "active",
      startedAt: OLD, // 1 hour ago, within a 2-hour window
      updatedAt: OLD,
      endedAt: null,
      metadata: null,
      lastMessageAt: OLD,
    });
    expect(result.isJoinable).toBe(true);
  });

  it("classifies terminal statuses", () => {
    expect(isTerminalStatus("resolved")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("error")).toBe(true);
    expect(isTerminalStatus("start_failed")).toBe(true);
    expect(isTerminalStatus("active")).toBe(false);
    expect(isTerminalStatus("emergency_suggested")).toBe(false);
  });
});
