import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../middleware/error.middleware";
import type { RegisterInput, LoginInput } from "./auth.schemas";

const SALT_ROUNDS = 12;

type SafeCaregiver = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

function toSafeCaregiver(c: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}): SafeCaregiver {
  return { id: c.id, name: c.name, email: c.email, createdAt: c.createdAt };
}

function signToken(caregiverId: string): string {
  // jsonwebtoken accepts values like "7d", but its TypeScript type is stricter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ sub: caregiverId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

export async function registerCaregiver(
  input: RegisterInput
): Promise<{ token: string; caregiver: SafeCaregiver }> {
  const existing = await prisma.caregiver.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new AppError(409, "Email is already in use", "EMAIL_CONFLICT");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const caregiver = await prisma.caregiver.create({
    data: { name: input.name, email: input.email, passwordHash },
  });

  return { token: signToken(caregiver.id), caregiver: toSafeCaregiver(caregiver) };
}

export async function loginCaregiver(
  input: LoginInput
): Promise<{ token: string; caregiver: SafeCaregiver }> {
  const caregiver = await prisma.caregiver.findUnique({
    where: { email: input.email },
  });
  if (!caregiver) {
    throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const valid = await bcrypt.compare(input.password, caregiver.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  return { token: signToken(caregiver.id), caregiver: toSafeCaregiver(caregiver) };
}

export async function getCaregiverById(
  id: string
): Promise<SafeCaregiver> {
  const caregiver = await prisma.caregiver.findUnique({ where: { id } });
  if (!caregiver) {
    throw new AppError(404, "Caregiver not found", "NOT_FOUND");
  }
  return toSafeCaregiver(caregiver);
}
