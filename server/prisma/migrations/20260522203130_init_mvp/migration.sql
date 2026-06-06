-- CreateTable
CREATE TABLE "caregivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caregivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timeOfDay" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_events" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "sourceDevice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_contacts" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary caregiver',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_events" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "sourceDevice" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beacons" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "beaconUuid" TEXT NOT NULL,
    "major" INTEGER,
    "minor" INTEGER,
    "thresholdDistanceM" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "dwellSeconds" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beacons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beacon_events" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "beaconId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "dwellSeconds" INTEGER,
    "estimatedDistanceM" DOUBLE PRECISION,
    "sourceDevice" TEXT NOT NULL DEFAULT 'phone',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beacon_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_events" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "heartRate" INTEGER,
    "motionState" TEXT,
    "stepCount" INTEGER,
    "sourceDevice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vital_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_sessions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "helpEventId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "viewerUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caregivers_email_key" ON "caregivers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patients_deviceId_key" ON "patients"("deviceId");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "caregivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_contacts" ADD CONSTRAINT "help_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_events" ADD CONSTRAINT "help_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beacons" ADD CONSTRAINT "beacons_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beacon_events" ADD CONSTRAINT "beacon_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beacon_events" ADD CONSTRAINT "beacon_events_beaconId_fkey" FOREIGN KEY ("beaconId") REFERENCES "beacons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_events" ADD CONSTRAINT "vital_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_helpEventId_fkey" FOREIGN KEY ("helpEventId") REFERENCES "help_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
