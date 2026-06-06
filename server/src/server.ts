import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(`[memaide-api] Server running on http://localhost:${env.PORT}`);
  console.log(`[memaide-api] Environment: ${env.NODE_ENV}`);
  console.log(`[memaide-api] Health: http://localhost:${env.PORT}/api/health`);
});

function shutdown(signal: string) {
  console.log(`\n[memaide-api] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("[memaide-api] Server closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[memaide-api] Unhandled promise rejection:", reason);
  process.exit(1);
});
