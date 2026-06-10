import nodemailer, { type Transporter } from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM =
  process.env.EMAIL_FROM || (GMAIL_USER ? `DoMe <${GMAIL_USER}>` : "DoMe");
const APP_URL = process.env.APP_URL || "http://localhost:3000";

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs) {
  const tx = getTransporter();
  if (!tx) {
    console.log(`[email disabled] to=${to} subject="${subject}"`);
    return { skipped: true as const };
  }
  try {
    await tx.sendMail({ from: FROM, to, subject, html });
    return { ok: true as const };
  } catch (e) {
    console.error("[email error]", e);
    return { error: true as const };
  }
}

function shell(title: string, body: string): string {
  return `
  <div style="background:#f4f4f5;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:#4f46e5;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">DoMe</span>
      </div>
      <div style="padding:24px;color:#18181b;font-size:15px;line-height:1.5;">
        <h1 style="font-size:18px;margin:0 0 16px;">${title}</h1>
        ${body}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;">
        <a href="${APP_URL}" style="color:#4f46e5;text-decoration:none;font-size:13px;">Open DoMe →</a>
      </div>
    </div>
  </div>`;
}

export function taskCompletedEmail(args: {
  recipientName: string;
  completerName: string;
  taskTitle: string;
  points: number;
}): { subject: string; html: string } {
  const { recipientName, completerName, taskTitle, points } = args;
  const subject = `✅ ${completerName} completed "${taskTitle}"`;
  const html = shell(
    "Task completed",
    `<p>Hi ${recipientName},</p>
     <p><strong>${completerName}</strong> just completed:</p>
     <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin:12px 0;">
       <div style="font-weight:600;font-size:16px;">${taskTitle}</div>
       <div style="color:#16a34a;font-weight:700;margin-top:4px;">+${points} points</div>
     </div>`,
  );
  return { subject, html };
}

export function dailyDigestEmail(args: {
  recipientName: string;
  rows: { name: string; color: string; today: number; week: number; total: number }[];
  pendingToday: number;
}): { subject: string; html: string } {
  const { recipientName, rows, pendingToday } = args;
  const subject = "☀️ Your DoMe daily points update";
  const body = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.color};margin-right:8px;"></span>
          ${r.name}
        </td>
        <td style="padding:8px 0;text-align:right;color:#16a34a;font-weight:600;">+${r.today} today</td>
        <td style="padding:8px 0;text-align:right;color:#71717a;">${r.week} this week</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;">${r.total} total</td>
      </tr>`,
    )
    .join("");
  const html = shell(
    "Good morning!",
    `<p>Hi ${recipientName}, here's where things stand:</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;">${body}</table>
     <p style="margin-top:16px;color:#71717a;">You have <strong>${pendingToday}</strong> task(s) on the schedule today.</p>`,
  );
  return { subject, html };
}
