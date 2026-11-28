# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Web app to schedule and run `rdiff-backup` jobs on a homelab server. FastAPI backend (`app/`) with SQLite, Next.js 15 frontend (`frontend/`), shipped as two Docker images (`docker/`). Only local backups are supported; SSH/remote destinations are a planned feature.

## Commands

Backend (run from `app/`; imports are top-level like `from db.session import ...`, so `app/` must be the working directory):

```bash
cd app && pip install -r requirements.txt
mkdir -p data && uvicorn main:app --reload --port 8686
```

`rdiff-backup` must be on PATH for jobs to run.

Tests (pytest, temp SQLite via `DATABASE_URL`, `subprocess.run` mocked; use Python 3.12):

```bash
cd app && pip install -r requirements-dev.txt
pytest                                   # all
pytest tests/test_jobs.py -k duplicate   # single test
```

Frontend:

```bash
cd frontend && npm install
npm run dev     # next dev --turbopack
npm run build
npm run lint    # next lint
npm test        # node --test on src/**/*.test.ts (Node 23.6+)
```

Docker (full stack):

```bash
cp docker/.env.example docker/.env   # then edit
cd docker && docker compose up -d --build
```

CI: `.github/workflows/tests.yml` runs pytest; `docker-validate.yml` runs hadolint and builds both images. Nothing pushes images.

## Architecture

- **Request path**: The browser calls `/api/*` only (typed client in `frontend/src/lib/api.ts`, TanStack Query hooks in `src/lib/queries.ts`). `frontend/next.config.ts` rewrites `/api/:path*` to `http://backend:8686/:path*`, which is the compose service name. Outside Docker, the hostname `backend` must resolve, or the rewrite target must change.
- **Trailing slashes**: Every backend route is registered both with and without a trailing slash. This avoids FastAPI redirects and 405s through the Next.js proxy. Keep this pattern for new routes.
- **Scheduling**: APScheduler `BackgroundScheduler` in `app/utils/scheduler_service.py`, in memory only. At startup (`lifespan` in `app/main.py`), `schedule_all_jobs()` reloads every job from the DB. Create, update and delete in `app/routes/backup_job.py` add or remove scheduler job `backup-{id}`. `schedule` is a 5-field cron string, validated in `BackupJobCreate` and loaded with `CronTrigger.from_crontab`.
- **Execution**: `app/utils/backup_utils.execute_backup` shells out to `rdiff-backup --api-version 201 backup <source> <dest>`. with `--print-statistics`; the stats block is parsed into columns on the run row (`BackupResult`, exposed as "runs" via `/runs`), and full output goes to `log`. A run row is created with status `running` when it starts. It is called by the scheduler (`run_scheduled_backup`) and by `POST /jobs/{id}/execute` (background task). Both claim the job first with `try_mark_running`, an atomic UPDATE, so a job never runs twice at once. Job status values: `pending`, `running`, `success`, `failed`; `reset_stale_jobs()` fails leftover `running` jobs at startup.
- **DB**: SQLite at `./data/app.db`, relative to the working directory. Override with env `DATABASE_URL`. Schema changes go through Alembic (`app/migrations/`); migrations run at startup, and a pre-Alembic DB is stamped at the baseline first. Real installs have old rows with null stats, so new columns must be nullable or backfilled. Routes use `get_db`; background code uses `with SessionLocal() as db:`.
- **Settings and notifications**: settings live in the DB with defaults in code (`GET/PUT /settings`, deep-merged per section). Notification channels store a type + config (secrets included, always returned masked as `********`; sending `********` back keeps the stored value) and the backend builds the Apprise URL from them. Run events fire after each run; a periodic checker (every 10 min) handles stale jobs, disk warnings and the weekly summary, with dedup state in the DB. Sending never blocks or fails a backup.
- **Excludes and retention**: rdiff-backup `--exclude` globs match absolute paths, so custom patterns not starting with `**` are anchored at the job's source. Retention runs `--force remove increments --older-than <N>D` after a successful backup; its failure is logged, not fatal. Existing jobs migrated with `retention_days = NULL` (keep forever).
- **Filesystem browsing**: `GET /list-directory?path=` lists subdirectories, restricted to `ALLOWED_ROOTS` (default `/app/source,/app/destination`). It feeds `FolderBrowser.tsx`.
- **Frontend**: Next.js app router with shadcn/ui (`src/components/ui/`), Tailwind v4, TanStack Query (polls fast only while a job runs). Pages: `/` dashboard, `/jobs`, `/jobs/view?id=`, `/jobs/new`, `/jobs/edit?id=`, `/activity`. No dynamic route segments, so the app can become a static export; page state (tab, filters, page) lives in the URL. Cron is generated from presets in `src/utils/schedule.ts`; keep users away from raw cron. Call `/api/...` without a trailing slash: Next redirects it with a 308.
- **Container paths**: The backend container mounts the host source at `/app/source` (read-only) and the destination at `/app/destination`. Job source and destination paths are container paths. The backend entrypoint (`docker/entrypoint.sh`) runs as root, applies `PUID`/`PGID` (default 1000, `0` keeps root) and drops privileges with `setpriv`. rdiff-backup runs as that user too.

## Gotchas

- Duplicate job names and destinations are rejected with 409. Two jobs sharing one rdiff-backup destination would overwrite each other's mirror.
- The backend image needs `procps`: rdiff-backup calls `ps` while handling its repository lock.
- `TZ` must be an IANA name (`Asia/Tokyo`, not `Japan/Tokyo`); the entrypoint falls back to UTC otherwise. Legacy runs were stored without a timezone and are read as server time.
- Port 8686 is not published by compose; reach the API through the frontend at `/api/*`.
- Releases are manual: tag `vX.Y.Z`, then build and push multi-arch images to Docker Hub as `jonymaster/homelab-backups-{backend,frontend}`, passing `--build-arg APP_VERSION=X.Y.Z` to the backend. In zsh, write tags as `${s}:latest`: `$s:latest` is parsed as the `:l` modifier.
