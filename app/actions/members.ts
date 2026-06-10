"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { memberSchema } from "@/lib/validation";
import { nextColor } from "@/lib/colors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addMemberAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the member details." };
  }
  const { name, email, password, color } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email is already in use." };
  }

  const members = await prisma.user.findMany({
    where: { householdId: user.householdId },
    select: { color: true },
  });
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      householdId: user.householdId,
      name,
      email,
      passwordHash,
      color: color ?? nextColor(members.map((m) => m.color)),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function removeMemberAction(
  memberId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (memberId === user.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const member = await prisma.user.findFirst({
    where: { id: memberId, householdId: user.householdId },
  });
  if (!member) return { ok: false, error: "Member not found." };

  const taskCount = await prisma.task.count({
    where: {
      householdId: user.householdId,
      OR: [{ assignerId: memberId }, { assigneeId: memberId }],
    },
  });
  if (taskCount > 0) {
    return {
      ok: false,
      error: "Delete or reassign this member's tasks before removing them.",
    };
  }

  await prisma.user.delete({ where: { id: member.id } });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
