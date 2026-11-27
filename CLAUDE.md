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

There is no test suite. CI (`.github/workflows/docker-validate.yml`) runs hadolint on both Dockerfiles and builds both images; it does not push.

## Architecture

- **Request path**: The browser calls `/api/*` only (`frontend/src/app/api.ts`). `frontend/next.config.ts` rewrites `/api/:path*` to `http://backend:8686/:path*`, which is the compose service name. Outside Docker, the hostname `backend` must resolve, or the rewrite target must change.
- **Trailing slashes**: Every backend route is registered both with and without a trailing slash. This avoids FastAPI redirects and 405s through the Next.js proxy. Keep this pattern for new routes.
- **Scheduling**: APScheduler `BackgroundScheduler` in `app/utils/scheduler_service.py`, in memory only. At startup (`lifespan` in `app/main.py`), `schedule_all_jobs()` reloads every job from the DB. Create, update and delete in `app/routes/backup_job.py` add or remove scheduler job `backup-{id}`. The `schedule` field is a cron string, but only the first two fields (minute, hour) are used. `parse_schedule` is duplicated in `routes/backup_job.py` and `utils/scheduler_service.py`.
- **Execution**: `app/utils/backup_utils.execute_backup` shells out to `rdiff-backup --api-version 201 backup <source> <dest>`. It sets `BackupJob.status` and writes one `BackupResult` row per run. It is called by the scheduler and by `POST /jobs/{id}/execute`, which uses a FastAPI background task.
- **DB**: SQLite at `./data/app.db`, relative to the working directory. Tables are created by `Base.metadata.create_all` at import time; there are no migrations. Both sync SQLAlchemy sessions (`get_db`) and the async `databases.Database` are set up, but routes use only the sync sessions.
- **Filesystem browsing**: `GET /list-directory?path=` lists subdirectories and feeds `DirectorySuggestions.tsx` in the job forms.
- **Container paths**: The backend container mounts the host source at `/app/source` (read-only) and the destination at `/app/destination`. Job source and destination paths are container paths.

## Gotchas

- `docker/.env.example` defines `BACKUP_DEST`, but `docker-compose.yaml` reads `BACKUP_DESTINATION`.
- Container timezone differs: `TZ=Europe/Madrid` in `Dockerfile.backend`, `TZ=Europe/Paris` in compose. Scheduled run times depend on it.
- `install.sh` is a legacy systemd install for the backend only. It is not used by the Docker setup.
