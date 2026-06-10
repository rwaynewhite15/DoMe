"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  requireUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { passwordChangeSchema, settingsSchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check your settings." };
  }
  const d = parsed.data;

  if (d.householdName !== undefined || d.timezone !== undefined) {
    await prisma.household.update({
      where: { id: user.householdId },
      data: {
        ...(d.householdName !== undefined ? { name: d.householdName } : {}),
        ...(d.timezone !== undefined ? { timezone: d.timezone } : {}),
      },
    });
  }

  const userData: Record<string, unknown> = {};
  if (d.name !== undefined) userData.name = d.name;
  if (d.color !== undefined) userData.color = d.color;
  if (d.notifyOnComplete !== undefined)
    userData.notifyOnComplete = d.notifyOnComplete;
  if (d.dailyDigest !== undefined) userData.dailyDigest = d.dailyDigest;
  if (Object.keys(userData).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: userData });
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function changePasswordAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  return { ok: true };
}
