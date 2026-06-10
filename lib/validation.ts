import { z } from "zod";

export const registerSchema = z.object({
  householdName: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const memberSchema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  kind: z.enum(["EVENT", "TASK"]),
  assigneeId: z.string().optional(),
  defaultPoints: z.coerce.number().int().min(0).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  allDay: z.boolean().optional(),
  freq: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.coerce.number().int().min(1).max(52).optional(),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
});

export const settingsSchema = z.object({
  householdName: z.string().trim().min(1).max(60).optional(),
  timezone: z.string().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  notifyOnComplete: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export type TaskInput = z.infer<typeof taskSchema>;
