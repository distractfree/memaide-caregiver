import "dotenv/config";
import { z } from "zod";

const defaultCorsOrigin = [
  "http://localhost:5273",
  "http://127.0.0.1:5273",
  "http://134.122.115.15:5273",
  "http://caregiver.guardianova.com",
  "https://caregiver.guardianova.com",
].join(",");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .default("postgresql://postgres:postgres@localhost:5432/memaide?schema=public"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters")
    .default("dev-secret-replace-in-production"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default(defaultCorsOrigin),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_JWT_SECRET: z.string().min(16, "ADMIN_JWT_SECRET must be at least 16 characters").default("admin-secret-replace-in-production"),
  ADMIN_JWT_EXPIRES_IN: z.string().default("8h"),

  // AI Agent (Anthony) backend integration.
  // AI_AGENT_API is a legacy alias for AI_AGENT_API_KEY; the service falls back
  // to it, but new deployments should set AI_AGENT_API_KEY.
  AI_AGENT_URL: z.string().url().optional(),
  AI_AGENT_WS_URL: z.string().optional(),
  AI_AGENT_API_KEY: z.string().optional(),
  AI_AGENT_API: z.string().optional(),
  AI_AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  AI_CALLBACK_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
