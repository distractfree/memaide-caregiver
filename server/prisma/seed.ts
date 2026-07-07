import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";
const DEMO_EMAIL = "demo@memaide.local";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
const minutesAfter = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000);

async function seedCaregiver() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  return prisma.caregiver.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      name: "Demo Caregiver",
      passwordHash,
    },
    create: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Caregiver",
      email: DEMO_EMAIL,
      passwordHash,
    },
  });
}

async function seedPatients(caregiverId: string) {
  const mary = await prisma.patient.upsert({
    where: { deviceId: "android-demo-001" },
    update: {
      caregiverId,
      name: "Mary Johnson",
      phoneNumber: "+18185550123",
    },
    create: {
      id: "22222222-2222-4222-8222-222222222222",
      caregiverId,
      name: "Mary Johnson",
      phoneNumber: "+18185550123",
      deviceId: "android-demo-001",
    },
  });

  const robert = await prisma.patient.upsert({
    where: { deviceId: "android-demo-002" },
    update: {
      caregiverId,
      name: "Robert Lee",
      phoneNumber: "+18185550124",
    },
    create: {
      id: "33333333-3333-4333-8333-333333333333",
      caregiverId,
      name: "Robert Lee",
      phoneNumber: "+18185550124",
      deviceId: "android-demo-002",
    },
  });

  return { mary, robert };
}

async function seedReminders(maryId: string, robertId: string) {
  const maryReminders = [
    {
      id: "demo-reminder-mary-medication",
      patientId: maryId,
      type: "medication",
      description: "Take morning medication",
      timeOfDay: "08:00",
      frequency: "daily",
      active: true,
    },
    {
      id: "demo-reminder-mary-hydration",
      patientId: maryId,
      type: "hydration",
      description: "Drink a glass of water",
      timeOfDay: "11:00",
      frequency: "daily",
      active: true,
    },
    {
      id: "demo-reminder-mary-lunch",
      patientId: maryId,
      type: "meal",
      description: "Lunch reminder",
      timeOfDay: "12:30",
      frequency: "daily",
      active: true,
    },
    {
      id: "demo-reminder-mary-walk",
      patientId: maryId,
      type: "activity",
      description: "Short walk",
      timeOfDay: "17:00",
      frequency: "daily",
      active: true,
    },
  ];

  const robertReminders = [
    {
      id: "demo-reminder-robert-medication",
      patientId: robertId,
      type: "medication",
      description: "Take evening medication",
      timeOfDay: "19:00",
      frequency: "daily",
      active: true,
    },
    {
      id: "demo-reminder-robert-hydration",
      patientId: robertId,
      type: "hydration",
      description: "Drink water",
      timeOfDay: "14:00",
      frequency: "daily",
      active: true,
    },
  ];

  for (const reminder of [...maryReminders, ...robertReminders]) {
    const { id, ...data } = reminder;
    await prisma.reminder.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  return maryReminders;
}

async function seedReminderEvents(maryId: string) {
  const medicationScheduledAt = minutesAgo(210);
  const hydrationScheduledAt = minutesAgo(135);
  const lunchScheduledAt = minutesAgo(75);
  const walkScheduledAt = minutesAgo(25);

  const events = [
    {
      id: "demo-reminder-event-mary-medication-ack",
      patientId: maryId,
      reminderId: "demo-reminder-mary-medication",
      scheduledAt: medicationScheduledAt,
      deliveredAt: minutesAfter(medicationScheduledAt, 1),
      acknowledgedAt: minutesAfter(medicationScheduledAt, 4),
      status: "acknowledged",
      sourceDevice: "watch",
    },
    {
      id: "demo-reminder-event-mary-hydration-delivered",
      patientId: maryId,
      reminderId: "demo-reminder-mary-hydration",
      scheduledAt: hydrationScheduledAt,
      deliveredAt: minutesAfter(hydrationScheduledAt, 1),
      acknowledgedAt: null,
      status: "delivered",
      sourceDevice: "phone",
    },
    {
      id: "demo-reminder-event-mary-lunch-missed",
      patientId: maryId,
      reminderId: "demo-reminder-mary-lunch",
      scheduledAt: lunchScheduledAt,
      deliveredAt: minutesAfter(lunchScheduledAt, 1),
      acknowledgedAt: null,
      status: "missed",
      sourceDevice: "phone",
    },
    {
      id: "demo-reminder-event-mary-walk-ack",
      patientId: maryId,
      reminderId: "demo-reminder-mary-walk",
      scheduledAt: walkScheduledAt,
      deliveredAt: minutesAfter(walkScheduledAt, 1),
      acknowledgedAt: minutesAfter(walkScheduledAt, 7),
      status: "acknowledged",
      sourceDevice: "watch",
    },
  ];

  for (const event of events) {
    const { id, ...data } = event;
    await prisma.reminderEvent.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
}

async function seedHelp(maryId: string) {
  await prisma.helpContact.upsert({
    where: { id: "demo-help-contact-mary" },
    update: {
      patientId: maryId,
      whatsappNumber: "+18185550123",
      label: "Primary caregiver",
      active: true,
    },
    create: {
      id: "demo-help-contact-mary",
      patientId: maryId,
      whatsappNumber: "+18185550123",
      label: "Primary caregiver",
      active: true,
    },
  });

  const helpTriggeredAt = minutesAgo(55);
  const events = [
    {
      id: "demo-help-event-mary-watch-triggered",
      patientId: maryId,
      triggeredAt: helpTriggeredAt,
      sourceDevice: "watch",
      whatsappNumber: "+18185550123",
      status: "triggered",
    },
    {
      id: "demo-help-event-mary-phone-whatsapp-opened",
      patientId: maryId,
      triggeredAt: minutesAfter(helpTriggeredAt, 1),
      sourceDevice: "phone",
      whatsappNumber: "+18185550123",
      status: "whatsapp_opened",
    },
  ];

  for (const event of events) {
    const { id, ...data } = event;
    await prisma.helpEvent.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
}

async function seedBeacons(maryId: string) {
  const beacons = [
    {
      id: "demo-beacon-mary-kitchen",
      patientId: maryId,
      roomName: "Kitchen",
      beaconUuid: "fda50693-a4e2-4fb1-afcf-c6eb07647825",
      major: 100,
      minor: 1,
      thresholdDistanceM: 3,
      dwellSeconds: 5,
      active: true,
    },
    {
      id: "demo-beacon-mary-bedroom",
      patientId: maryId,
      roomName: "Bedroom",
      beaconUuid: "74278bda-b644-4520-8f0c-720eaf059935",
      major: 100,
      minor: 2,
      thresholdDistanceM: 3,
      dwellSeconds: 5,
      active: true,
    },
    {
      id: "demo-beacon-mary-living-room",
      patientId: maryId,
      roomName: "Living Room",
      beaconUuid: "e2c56db5-dffb-48d2-b060-d0f5a71096e0",
      major: 100,
      minor: 3,
      thresholdDistanceM: 3,
      dwellSeconds: 5,
      active: true,
    },
  ];

  for (const beacon of beacons) {
    const { id, ...data } = beacon;
    await prisma.beacon.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  return beacons;
}

async function seedBeaconEvents(maryId: string) {
  const kitchenMorning = minutesAgo(240);
  const livingRoomMidday = minutesAgo(150);
  const bedroomAfternoon = minutesAgo(70);
  const kitchenEvening = minutesAgo(18);

  const events = [
    {
      id: "demo-beacon-event-mary-kitchen-morning",
      patientId: maryId,
      beaconId: "demo-beacon-mary-kitchen",
      roomName: "Kitchen",
      detectedAt: kitchenMorning,
      exitedAt: minutesAfter(kitchenMorning, 14),
      dwellSeconds: 840,
      estimatedDistanceM: 2.2,
      sourceDevice: "phone",
    },
    {
      id: "demo-beacon-event-mary-living-room-midday",
      patientId: maryId,
      beaconId: "demo-beacon-mary-living-room",
      roomName: "Living Room",
      detectedAt: livingRoomMidday,
      exitedAt: minutesAfter(livingRoomMidday, 40),
      dwellSeconds: 2400,
      estimatedDistanceM: 2.8,
      sourceDevice: "phone",
    },
    {
      id: "demo-beacon-event-mary-bedroom-afternoon",
      patientId: maryId,
      beaconId: "demo-beacon-mary-bedroom",
      roomName: "Bedroom",
      detectedAt: bedroomAfternoon,
      exitedAt: minutesAfter(bedroomAfternoon, 20),
      dwellSeconds: 1200,
      estimatedDistanceM: 1.9,
      sourceDevice: "phone",
    },
    {
      id: "demo-beacon-event-mary-kitchen-evening",
      patientId: maryId,
      beaconId: "demo-beacon-mary-kitchen",
      roomName: "Kitchen",
      detectedAt: kitchenEvening,
      exitedAt: null,
      dwellSeconds: 1320,
      estimatedDistanceM: 2.4,
      sourceDevice: "phone",
    },
  ];

  for (const event of events) {
    const { id, ...data } = event;
    await prisma.beaconEvent.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
}

async function seedVitals(maryId: string) {
  const events = [
    {
      id: "demo-vital-mary-0800",
      patientId: maryId,
      timestamp: minutesAgo(210),
      heartRate: 72,
      motionState: "walking",
      stepCount: 650,
      sourceDevice: "watch",
    },
    {
      id: "demo-vital-mary-1000",
      patientId: maryId,
      timestamp: minutesAgo(150),
      heartRate: 68,
      motionState: "idle",
      stepCount: 980,
      sourceDevice: "watch",
    },
    {
      id: "demo-vital-mary-1230",
      patientId: maryId,
      timestamp: minutesAgo(90),
      heartRate: 82,
      motionState: "walking",
      stepCount: 1630,
      sourceDevice: "watch",
    },
    {
      id: "demo-vital-mary-1500",
      patientId: maryId,
      timestamp: minutesAgo(35),
      heartRate: 88,
      motionState: "active",
      stepCount: 2140,
      sourceDevice: "watch",
    },
    {
      id: "demo-vital-mary-1800",
      patientId: maryId,
      timestamp: minutesAgo(12),
      heartRate: 78,
      motionState: "walking",
      stepCount: 2450,
      sourceDevice: "watch",
    },
  ];

  for (const event of events) {
    const { id, ...data } = event;
    await prisma.vitalEvent.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
}

async function seedStreamSessions(maryId: string) {
  const endedStartedAt = minutesAgo(65);
  const activeStartedAt = minutesAgo(50);

  await prisma.streamSession.upsert({
    where: { id: "demo-stream-mary-ended" },
    update: {
      patientId: maryId,
      helpEventId: "demo-help-event-mary-watch-triggered",
      startedAt: endedStartedAt,
      endedAt: minutesAfter(endedStartedAt, 12),
      source: "mock",
      status: "ended",
      viewerUrl: null,
      metadata: { scenario: "ended-demo-session" },
    },
    create: {
      id: "demo-stream-mary-ended",
      patientId: maryId,
      helpEventId: "demo-help-event-mary-watch-triggered",
      startedAt: endedStartedAt,
      endedAt: minutesAfter(endedStartedAt, 12),
      source: "mock",
      status: "ended",
      viewerUrl: null,
      metadata: { scenario: "ended-demo-session" },
    },
  });

  await prisma.streamSession.upsert({
    where: { id: "demo-stream-mary-active" },
    update: {
      patientId: maryId,
      helpEventId: "demo-help-event-mary-phone-whatsapp-opened",
      startedAt: activeStartedAt,
      endedAt: null,
      source: "glasses",
      status: "active",
      viewerUrl: "https://example.com/view/demo-session",
      metadata: { scenario: "active-demo-session" },
    },
    create: {
      id: "demo-stream-mary-active",
      patientId: maryId,
      helpEventId: "demo-help-event-mary-phone-whatsapp-opened",
      startedAt: activeStartedAt,
      endedAt: null,
      source: "glasses",
      status: "active",
      viewerUrl: "https://example.com/view/demo-session",
      metadata: { scenario: "active-demo-session" },
    },
  });
}

async function seedAiSessions(maryId: string) {
  const sessionId = "demo-ai-session-mary-resolved";
  const startedAt = minutesAgo(52);
  const caregiverJoinedAt = minutesAgo(49);
  const endedAt = minutesAgo(42);

  await prisma.aiSession.upsert({
    where: { id: sessionId },
    update: {
      patientId: maryId,
      helpEventId: "demo-help-event-mary-phone-whatsapp-opened",
      status: "resolved",
      startedAt,
      caregiverJoinedAt,
      endedAt,
      summary: "Patient requested help. Caregiver joined and resolved the care coordination session.",
    },
    create: {
      id: sessionId,
      patientId: maryId,
      helpEventId: "demo-help-event-mary-phone-whatsapp-opened",
      status: "resolved",
      startedAt,
      caregiverJoinedAt,
      endedAt,
      summary: "Patient requested help. Caregiver joined and resolved the care coordination session.",
    },
  });

  const messages = [
    {
      id: "demo-ai-msg-1",
      aiSessionId: sessionId,
      senderType: "system",
      message: "Support session started.",
      createdAt: startedAt,
    },
    {
      id: "demo-ai-msg-2",
      aiSessionId: sessionId,
      senderType: "ai",
      message: "Hi, I'm here with you.",
      createdAt: minutesAfter(startedAt, 1),
    },
    {
      id: "demo-ai-msg-3",
      aiSessionId: sessionId,
      senderType: "ai",
      message: "Can you tell me what happened?",
      createdAt: minutesAfter(startedAt, 2),
    },
    {
      id: "demo-ai-msg-4",
      aiSessionId: sessionId,
      senderType: "patient",
      message: "I pressed the help button.",
      createdAt: minutesAfter(startedAt, 3),
    },
    {
      id: "demo-ai-msg-5",
      aiSessionId: sessionId,
      senderType: "ai",
      message: "I will keep this session open while your caregiver is notified.",
      createdAt: minutesAfter(startedAt, 4),
    },
    {
      id: "demo-ai-msg-6",
      aiSessionId: sessionId,
      senderType: "patient",
      message: "Okay.",
      createdAt: minutesAfter(startedAt, 5),
    },
    {
      id: "demo-ai-msg-7",
      aiSessionId: sessionId,
      senderType: "event",
      message: "Caregiver joined the support session.",
      createdAt: caregiverJoinedAt,
    },
    {
      id: "demo-ai-msg-8",
      aiSessionId: sessionId,
      senderType: "event",
      message: "Session resolved.",
      createdAt: endedAt,
    },
  ];

  for (const msg of messages) {
    const { id, ...data } = msg;
    await prisma.aiSessionMessage.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
}

async function main() {
  const caregiver = await seedCaregiver();
  const { mary, robert } = await seedPatients(caregiver.id);

  await seedReminders(mary.id, robert.id);
  await seedReminderEvents(mary.id);
  await seedHelp(mary.id);
  await seedBeacons(mary.id);
  await seedBeaconEvents(mary.id);
  await seedVitals(mary.id);
  await seedStreamSessions(mary.id);
  await seedAiSessions(mary.id);

  console.log("Seed complete");
  console.log(`Demo caregiver: ${DEMO_EMAIL}`);
  console.log("Demo patients: android-demo-001, android-demo-002");
}

main()
  .catch((error) => {
    console.error("Seed failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
