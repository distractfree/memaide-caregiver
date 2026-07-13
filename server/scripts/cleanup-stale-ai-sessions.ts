/**
 * Safe cleanup for AI sessions that were left in a non-terminal state and are
 * now stale (e.g. old integration-test sessions still showing as Active).
 *
 * Behaviour:
 *   - DRY-RUN by default: prints what WOULD change and modifies nothing.
 *   - Requires an explicit `--apply` flag to write changes.
 *   - Never deletes any session or message; only closes eligible ones.
 *   - Sets endedAt and moves the session to the existing terminal status
 *     `cancelled`, recording a cleanup reason in metadata.
 *   - Idempotent: only ever processes non-terminal sessions that match the
 *     stale rule, so re-running it is safe.
 *
 * Usage:
 *   npm run ai-sessions:cleanup-stale
 *   npm run ai-sessions:cleanup-stale -- --apply
 */
import { prisma } from "../src/lib/prisma";
import {
  NON_TERMINAL_STATUSES,
  computeJoinability,
  getStaleMinutes,
} from "../src/modules/ai-sessions/ai-session.lifecycle";

const CLEANUP_REASON = "stale_session_cleanup";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function ageMinutes(from: Date | null): string {
  if (!from) return "unknown";
  const minutes = Math.round((Date.now() - from.getTime()) / 60_000);
  return `${minutes}m`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const staleMinutes = getStaleMinutes();

  console.log(
    `[cleanup-stale-ai-sessions] mode=${apply ? "APPLY" : "DRY-RUN"} staleMinutes=${staleMinutes}`
  );

  const candidates = await prisma.aiSession.findMany({
    where: { status: { in: NON_TERMINAL_STATUSES } },
    orderBy: { startedAt: "asc" },
    include: {
      patient: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const eligible = candidates.filter((s) => {
    const joinability = computeJoinability({
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      updatedAt: s.updatedAt,
      caregiverJoinedAt: s.caregiverJoinedAt,
      emergencySuggestedAt: s.emergencySuggestedAt,
      metadata: s.metadata,
      lastMessageAt: s.messages?.[0]?.createdAt ?? null,
    });
    // Only touch sessions that are demonstrably stale by the shared rule. This
    // now covers ANY non-terminal status past the threshold, including old
    // `caregiver_joined` and `starting` sessions, because staleness is evaluated
    // before "not_live" in computeJoinability.
    return joinability.joinabilityReason === "stale";
  });

  console.log(
    `Found ${candidates.length} non-terminal session(s); ${eligible.length} match the stale rule.`
  );

  for (const s of eligible) {
    const lastActivity = s.messages?.[0]?.createdAt ?? s.updatedAt ?? s.startedAt;
    console.log(
      `- session=${s.id} patient=${s.patient?.name ?? s.patientId} status=${s.status} age=${ageMinutes(s.startedAt)} lastActivity=${ageMinutes(lastActivity)} action=close(cancelled)`
    );

    if (apply) {
      const now = new Date();
      await prisma.aiSession.update({
        where: { id: s.id },
        data: {
          status: "cancelled",
          endedAt: s.endedAt ?? now,
          metadata: {
            ...asRecord(s.metadata),
            cleanupReason: CLEANUP_REASON,
            cleanupAt: now.toISOString(),
          },
        },
      });
    }
  }

  if (!apply) {
    console.log(
      "\nDry-run complete. No records were modified. Re-run with `-- --apply` to close these sessions."
    );
  } else {
    console.log(`\nApply complete. Closed ${eligible.length} stale session(s).`);
  }
}

main()
  .catch((error) => {
    console.error("[cleanup-stale-ai-sessions] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
