// Render cron entrypoint: POSTs to the app's daily-digest endpoint.
// Uses Node's global fetch (Node 18+) so it needs no dependencies.
const base = (process.env.APP_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("APP_URL is not set");
  process.exit(1);
}

const res = await fetch(`${base}/api/cron/daily`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
});
const text = await res.text();
console.log(`[cron-trigger] ${res.status} ${text}`);
if (!res.ok) process.exit(1);
