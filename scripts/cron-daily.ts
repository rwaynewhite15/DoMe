/**
 * Standalone daily job for the Render cron service.
 * Runs the same logic as POST /api/cron/daily but directly against the DB,
 * so it needs no public URL. Invoked via `npm run cron:daily`.
 */
import { runDailyDigest } from "../lib/cron";

async function main() {
  const result = await runDailyDigest();
  console.log("[cron] daily digest complete", JSON.stringify(result));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cron] daily digest failed", err);
    process.exit(1);
  });
