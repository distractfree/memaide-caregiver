import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    env: {
      NODE_ENV: "test",
      PORT: "4001",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/memaide_test",
      JWT_SECRET: "test-jwt-secret-vitest-min16chars",
      JWT_EXPIRES_IN: "1h",
      CORS_ORIGIN: "http://localhost:5273",
    },
  },
});
