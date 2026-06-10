"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema, registerSchema } from "@/lib/validation";
import { MEMBER_COLORS } from "@/lib/colors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }
  const { householdName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: householdName },
    });
    return tx.user.create({
      data: {
        householdId: household.id,
        name,
        email,
        passwordHash,
        color: MEMBER_COLORS[0],
      },
    });
  });

  await createSession(user.id);
  redirect("/");
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Incorrect email or password." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
