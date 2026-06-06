-- CreateTable
CREATE TABLE "ai_sessions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "helpEventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "caregiverJoinedAt" TIMESTAMP(3),
    "backupSuggestedAt" TIMESTAMP(3),
    "backupNotifiedAt" TIMESTAMP(3),
    "emergencySuggestedAt" TIMESTAMP(3),
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_session_messages" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_session_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_helpEventId_fkey" FOREIGN KEY ("helpEventId") REFERENCES "help_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session_messages" ADD CONSTRAINT "ai_session_messages_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
