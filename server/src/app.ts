import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import healthRouter from "./routes/health.routes";
import authRouter from "./modules/auth/auth.routes";
import adminRouter from "./modules/admin/admin.routes";
import patientRouter from "./modules/patients/patient.routes";
import {
  patientReminderRouter,
  reminderByIdRouter,
} from "./modules/reminders/reminder.routes";
import {
  patientReminderEventRouter,
  patientReportRouter,
} from "./modules/reminder-events/reminder-event.routes";
import { patientHelpRouter } from "./modules/help/help.routes";
import {
  beaconByIdRouter,
  patientBeaconEventRouter,
  patientBeaconReportRouter,
  patientBeaconRouter,
} from "./modules/beacons/beacon.routes";
import {
  patientVitalsReportRouter,
  patientVitalsRouter,
} from "./modules/vitals/vital.routes";
import {
  patientStreamSessionRouter,
  patientStreamStatusRouter,
  streamSessionByIdRouter,
} from "./modules/streams/stream.routes";
import {
  patientAiSessionRouter,
  aiSessionByIdRouter,
} from "./modules/ai-sessions/ai-session.routes";
import { aiFrameCallbackRouter } from "./modules/ai-sessions/ai-frame.routes";
import mobileRouter from "./modules/mobile/mobile.routes";
import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
    credentials: true,
  })
);

// Request logging (development only)
if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Frame callbacks need larger JSON payloads. This dedicated route is mounted
// before the global parser, so every other endpoint remains capped at 10 KB.
app.use("/api/ai-sessions", aiFrameCallbackRouter);

// Body parsing for all ordinary API routes.
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/patients", patientRouter);
app.use("/api/patients/:patientId/reminders", patientReminderRouter);
app.use("/api/patients/:patientId/reminder-events", patientReminderEventRouter);
app.use("/api/patients/:patientId/reports", patientReportRouter);
app.use("/api/reminders", reminderByIdRouter);
app.use("/api/patients/:patientId", patientHelpRouter);
app.use("/api/patients/:patientId/beacons", patientBeaconRouter);
app.use("/api/patients/:patientId/beacon-events", patientBeaconEventRouter);
app.use("/api/patients/:patientId/reports/beacons", patientBeaconReportRouter);
app.use("/api/patients/:patientId/vitals", patientVitalsRouter);
app.use("/api/patients/:patientId/reports/vitals", patientVitalsReportRouter);
app.use("/api/patients/:patientId/stream-sessions", patientStreamSessionRouter);
app.use("/api/patients/:patientId/stream-status", patientStreamStatusRouter);
app.use("/api/patients/:patientId/ai-sessions", patientAiSessionRouter);
app.use("/api/beacons", beaconByIdRouter);
app.use("/api/stream-sessions", streamSessionByIdRouter);
app.use("/api/ai-sessions", aiSessionByIdRouter);
app.use("/api/mobile", mobileRouter);

// 404 handler — must come after all routes
app.use(notFoundMiddleware);

// Centralized error handler — must be last
app.use(errorMiddleware);

export default app;
