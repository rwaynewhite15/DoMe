import { NextRequest, NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] daily digest failed", e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
