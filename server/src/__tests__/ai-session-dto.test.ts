import { describe, it, expect } from "vitest";
import {
  deriveRegistrationStatus,
  mapSenderTypeToRole,
  toApiMessage,
  toApiMessages,
} from "../modules/ai-sessions/ai-session.dto";

describe("AI session message DTO", () => {
  it("maps patient/message to user/content", () => {
    const dto = toApiMessage({
      id: "m1",
      aiSessionId: "s1",
      senderType: "patient",
      message: "I can't find my pills",
      createdAt: new Date("2026-07-08T02:10:20.000Z"),
    });
    expect(dto.role).toBe("user");
    expect(dto.content).toBe("I can't find my pills");
    expect(dto.createdAt).toBe("2026-07-08T02:10:20.000Z");
  });

  it("maps ai/message to assistant/content", () => {
    const dto = toApiMessage({
      id: "m2",
      aiSessionId: "s1",
      senderType: "ai",
      message: "I'm here to help.",
      createdAt: "2026-07-08T02:10:01.000Z",
    });
    expect(dto.role).toBe("assistant");
    expect(dto.content).toBe("I'm here to help.");
  });

  it("maps caregiver to a distinct caregiver role", () => {
    expect(mapSenderTypeToRole("caregiver")).toBe("caregiver");
  });

  it("maps event messages to a visible system role (not blank)", () => {
    const dto = toApiMessage({
      id: "m3",
      aiSessionId: "s1",
      senderType: "event",
      message: "Caregiver joined the support session.",
      createdAt: "2026-07-08T02:11:00.000Z",
    });
    expect(dto.role).toBe("system");
    expect(dto.content).toBe("Caregiver joined the support session.");
  });

  it("maps system messages to system", () => {
    expect(mapSenderTypeToRole("system")).toBe("system");
  });

  it("maps an unknown sender type safely to system", () => {
    expect(mapSenderTypeToRole("something_new")).toBe("system");
  });

  it("toApiMessages tolerates null/undefined", () => {
    expect(toApiMessages(null)).toEqual([]);
    expect(toApiMessages(undefined)).toEqual([]);
  });

  it("derives registrationStatus from metadata evidence", () => {
    expect(
      deriveRegistrationStatus("active", { aiAgentRegisteredAt: "2026-07-08T02:10:00Z" })
    ).toBe("registered");
    expect(deriveRegistrationStatus("start_failed", { registrationFailed: true })).toBe(
      "failed"
    );
    expect(deriveRegistrationStatus("starting", {})).toBe("unknown");
    expect(deriveRegistrationStatus("active", null)).toBe("unknown");
  });
});
