/**
 * Read-only production-readiness check for the egocentric frame stream.
 *
 * This script never writes application data, contacts Anthony/Arian, starts a
 * stream, or prints secret values. It is intended for an operator to run in
 * the same environment as the backend immediately before a controlled deploy.
 */
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

let failed = false;

function pass(label: string) {
  console.log(`[pass] ${label}`);
}

function fail(label: string) {
  failed = true;
  console.error(`[fail] ${label}`);
}

function requireConfigured(label: string, configured: boolean) {
  if (configured) pass(`${label} is configured`);
  else fail(`${label} is missing`);
}

async function verifyDatabase() {
  try {
    await prisma.$queryRaw<Array<{ ready: number }>>`SELECT 1 AS ready`;
    await Promise.all([
      prisma.patient.findFirst({ select: { id: true } }),
      prisma.aiSession.findFirst({ select: { id: true } }),
      prisma.streamSession.findFirst({ select: { id: true } }),
    ]);
    pass("database connection and Patient, AiSession, and StreamSession models are readable");
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown error";
    fail(`database/model read check failed (${name})`);
  }
}

async function main() {
  console.log("Egocentric stream readiness check (read-only; secrets are never printed)");

  requireConfigured("AI_CALLBACK_API_KEY", Boolean(env.AI_CALLBACK_API_KEY?.trim()));
  requireConfigured("AI_AGENT_URL", Boolean(env.AI_AGENT_URL?.trim()));
  requireConfigured("AI_AGENT_WS_URL", Boolean(env.AI_AGENT_WS_URL?.trim()));
  requireConfigured(
    "AI_AGENT_API_KEY (or legacy AI_AGENT_API)",
    Boolean(env.AI_AGENT_API_KEY?.trim() || env.AI_AGENT_API?.trim())
  );

  if (env.AI_FRAME_MAX_DECODED_BYTES <= 786432) {
    pass("AI_FRAME_MAX_DECODED_BYTES is at or below the documented 786432-byte limit");
  } else {
    fail("AI_FRAME_MAX_DECODED_BYTES exceeds the documented 786432-byte limit");
  }
  pass("frame parser, cache TTL, and cache-capacity settings passed environment validation");

  await verifyDatabase();

  const pm2Instance = process.env.NODE_APP_INSTANCE;
  console.log(
    pm2Instance === undefined
      ? "[warn] Frame cache is process-local. Confirm PM2 runs exactly one backend process before release."
      : "[warn] PM2 instance detected. Frame cache is process-local; confirm pm2 status shows exactly one backend process before release."
  );

  if (failed) process.exitCode = 1;
  else pass("egocentric stream readiness checks completed");
}

main()
  .catch(() => {
    fail("unexpected readiness-check failure");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
