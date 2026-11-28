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
```

Docker (full stack):

```bash
cp docker/.env.example docker/.env   # then edit
cd docker && docker compose up -d --build
```

CI (`.github/workflows/docker-validate.yml`) runs hadolint on both Dockerfiles and builds both images. It does not run pytest and does not push images.

## Architecture

- **Request path**: The browser calls `/api/*` only (`frontend/src/app/api.ts`). `frontend/next.config.ts` rewrites `/api/:path*` to `http://backend:8686/:path*`, which is the compose service name. Outside Docker, the hostname `backend` must resolve, or the rewrite target must change.
- **Trailing slashes**: Every backend route is registered both with and without a trailing slash. This avoids FastAPI redirects and 405s through the Next.js proxy. Keep this pattern for new routes.
- **Scheduling**: APScheduler `BackgroundScheduler` in `app/utils/scheduler_service.py`, in memory only. At startup (`lifespan` in `app/main.py`), `schedule_all_jobs()` reloads every job from the DB. Create, update and delete in `app/routes/backup_job.py` add or remove scheduler job `backup-{id}`. `schedule` is a 5-field cron string, validated in `BackupJobCreate` and loaded with `CronTrigger.from_crontab`.
- **Execution**: `app/utils/backup_utils.execute_backup` shells out to `rdiff-backup --api-version 201 backup <source> <dest>`. It sets `BackupJob.status` and writes one `BackupResult` row per run. It is called by the scheduler (`run_scheduled_backup`) and by `POST /jobs/{id}/execute` (background task). Both claim the job first with `try_mark_running`, an atomic UPDATE, so a job never runs twice at once. Job status values: `pending`, `running`, `success`, `failed`; `reset_stale_jobs()` fails leftover `running` jobs at startup.
- **DB**: SQLite at `./data/app.db`, relative to the working directory. Override with env `DATABASE_URL`. Tables are created by `Base.metadata.create_all` at import time; there are no migrations, so schema changes need care with existing installs. Routes use `get_db`; background code uses `with SessionLocal() as db:`.
- **Filesystem browsing**: `GET /list-directory?path=` lists subdirectories, restricted to `ALLOWED_ROOTS` (default `/app/source,/app/destination`). It feeds `FolderField.tsx`.
- **Frontend**: one page (`src/app/page.tsx`) with `JobForm` for create and edit. Cron is generated from presets in `src/utils/schedule.ts` (pure functions: `toCron`, `parseCron`, `summarize`); keep users away from raw cron. Logic lives in `src/utils/`, not `src/lib/`, because the root `.gitignore` ignores `lib/`.
- **Container paths**: The backend container mounts the host source at `/app/source` (read-only) and the destination at `/app/destination`. Job source and destination paths are container paths. The backend entrypoint (`docker/entrypoint.sh`) runs as root, applies `PUID`/`PGID` (default 1000, `0` keeps root) and drops privileges with `setpriv`. rdiff-backup runs as that user too.

## Gotchas

- Duplicate job names and destinations are rejected with 409. Two jobs sharing one rdiff-backup destination would overwrite each other's mirror.
- The backend image needs `procps`: rdiff-backup calls `ps` while handling its repository lock.
- Port 8686 is not published by compose; reach the API through the frontend at `/api/*`.
- Releases are manual: tag `vX.Y.Z`, then build and push multi-arch images to Docker Hub as `jonymaster/homelab-backups-{backend,frontend}`.
