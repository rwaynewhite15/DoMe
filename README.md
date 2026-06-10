# DoMe

A shared household planner for couples and families — schedule events and tasks,
drag to prioritize them, and earn points for getting things done. Think Skylight
Calendar, plus a fair, customizable point system.

## Features

- 📅 **Events & tasks** — single or recurring (daily / weekly / monthly), with times.
- 🔀 **Drag to prioritize** — reorder a day's items; order is saved per occurrence.
- 🏆 **Points & trends** — assign points to tasks; completing them scores the assignee.
  A leaderboard and 30-day trend chart show who's on top.
- ⚖️ **Fair budgets** — each person can assign at most **100 points per rolling 7-day
  week** (the window starts today and slides forward daily). The app blocks edits that
  would go over budget.
- ✏️ **Editable until done** — points on any occurrence can be edited until it's
  completed, then they lock. Recurring tasks have a default point value, and each
  individual occurrence can be edited independently.
- 📧 **Email** (via [Resend](https://resend.com)) — a notification when a task you
  assigned is completed, plus a daily points digest.
- 📱 **Mobile-first & installable** — responsive on any device and installable as a PWA.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Prisma + PostgreSQL (Neon) ·
custom JWT auth (jose + bcryptjs) · dnd-kit · rrule · Recharts · Resend.

## Local development

**Prerequisites:** Node 22+, and a PostgreSQL database (a local Docker container or a
free [Neon](https://neon.tech) branch both work).

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env
#    then edit .env — set DATABASE_URL / DIRECT_URL and AUTH_SECRET (any long random string)

# 3. Create the schema
npm run db:migrate        # prisma migrate dev

# 4. (optional) seed a demo household
npm run db:seed           # login: robert@example.com / password123

# 5. Run it
npm run dev               # http://localhost:3000
```

A quick local Postgres via Docker:

```bash
docker run -d --name dome-pg -e POSTGRES_USER=dome -e POSTGRES_PASSWORD=dome \
  -e POSTGRES_DB=dome -p 5433:5432 postgres:16
# DATABASE_URL=DIRECT_URL=postgresql://dome:dome@localhost:5433/dome?sslmode=disable
```

## Environment variables

| Variable          | Required | Notes                                                        |
| ----------------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`    | yes      | Neon **pooled** connection string (`...-pooler...`).         |
| `DIRECT_URL`      | yes      | Neon **direct** connection string (used for migrations).     |
| `AUTH_SECRET`     | yes      | Long random string used to sign session JWTs.                |
| `RESEND_API_KEY`  | no       | Enables email. If unset, emails are logged and skipped.      |
| `EMAIL_FROM`      | no       | e.g. `DoMe <onboarding@resend.dev>` until you verify a domain. |
| `CRON_SECRET`     | yes\*    | Bearer token guarding `/api/cron/daily`. \*needed in prod.   |
| `APP_URL`         | yes\*    | Public app URL; used in emails and by the cron job.          |

## Deploy to Render (Blueprint) with Neon

1. **Create a Neon database.** Copy both connection strings: the **pooled** one
   (host contains `-pooler`) → `DATABASE_URL`, and the **direct** one → `DIRECT_URL`.
2. **Create a Resend account** (optional but recommended) and copy an API key.
3. In **Render → New → Blueprint**, connect this repo. Render reads
   [`render.yaml`](./render.yaml) and provisions the (free) web service.
4. When prompted, paste the values for the variables marked `sync: false`:
   `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, and
   `CRON_SECRET` (pick any long random string). Set `APP_URL` to your Render web URL —
   you can fill it after the first deploy and redeploy. `AUTH_SECRET` is generated
   automatically.
5. Apply. The build runs `prisma migrate deploy` automatically, so the schema is created
   on first deploy. Open the app, **Create a household**, then add your partner under
   **Settings → Members**.

### Daily digest (free, via GitHub Actions)

Render cron jobs are a paid add-on, so the daily digest is driven by a free scheduled
workflow, [`.github/workflows/daily-digest.yml`](./.github/workflows/daily-digest.yml),
which POSTs to `/api/cron/daily` (this also tops up recurring occurrences). To enable it,
add two **repository secrets** (Settings → Secrets and variables → Actions):

- `APP_URL` — your deployed app URL (e.g. `https://dome.onrender.com`)
- `CRON_SECRET` — the same value you set in Render

Adjust the `cron:` time in the workflow (it's in UTC) to a morning hour for your timezone.
You can also trigger it manually from the Actions tab, or hit the endpoint yourself:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily`.

## Scripts

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the dev server                         |
| `npm run build`      | Production build (`prisma generate` + build) |
| `npm run db:migrate` | Create & apply a dev migration               |
| `npm run db:deploy`  | Apply migrations (production)                 |
| `npm run db:studio`  | Open Prisma Studio                           |
| `npm run db:seed`    | Seed a demo household                        |
| `npm run cron:daily` | Run the daily digest job locally             |

## Project structure

```
app/
  (app)/            authenticated shell + pages (today, calendar, tasks, points, settings)
  actions/          server actions (auth, tasks, occurrences, members, settings)
  api/              health + cron endpoints
  login, register   public auth pages
components/          UI: Board, TaskForm, charts, nav, settings forms…
lib/                db, auth, dates, recurrence, budget, points, email, queries, cron
prisma/             schema + migrations + seed
proxy.ts            route protection (Next 16 proxy/middleware)
render.yaml         Render Blueprint
```
