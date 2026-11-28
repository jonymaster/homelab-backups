from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.models import BackupJob, BackupResult
from utils.scheduler_service import next_run_time, schedule_interval

FINISHED = ("success", "failed")
HISTORY_SIZE = 14
NEWEST_FIRST = (BackupResult.started_at.desc(), BackupResult.id.desc())
STALE_GRACE = timedelta(hours=1)


def compute_health(job: BackupJob, last_run, last_finished, last_success_at, now: datetime) -> str:
    if job.status == "running":
        return "running"
    if job.paused:
        return "paused"
    if last_run is None:
        return "new"
    if last_finished is not None and last_finished.status == "failed":
        return "failing"
    interval = schedule_interval(job.schedule)
    if interval and last_success_at and now - last_success_at > 2 * interval + STALE_GRACE:
        return "stale"
    return "healthy"


def job_summary(db: Session, job: BackupJob, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    runs = db.query(BackupResult).filter(BackupResult.job_id == job.id)
    finished = runs.filter(BackupResult.status.in_(FINISHED))

    last_run = runs.order_by(*NEWEST_FIRST).first()
    last_finished = finished.order_by(*NEWEST_FIRST).first()
    last_success = finished.filter(BackupResult.status == "success").order_by(*NEWEST_FIRST).first()
    last_success_at = last_success and (last_success.finished_at or last_success.started_at)
    history = [r.status for r in finished.order_by(*NEWEST_FIRST).limit(HISTORY_SIZE)][::-1]

    recent = finished.filter(BackupResult.started_at >= now - timedelta(days=30))
    total_30d = recent.count()
    success_30d = recent.filter(BackupResult.status == "success")
    avg_duration = success_30d.with_entities(func.avg(BackupResult.duration_seconds)).scalar()

    return {
        "id": job.id,
        "name": job.name,
        "source": job.source,
        "destination": job.destination,
        "schedule": job.schedule,
        "status": job.status,
        "paused": job.paused,
        "retention_days": job.retention_days,
        "exclude_presets": job.exclude_presets or [],
        "exclude_patterns": job.exclude_patterns or [],
        "notify": job.notify or "default",
        "ping_url": job.ping_url,
        "created_at": job.created_at,
        "next_run": None if job.paused else next_run_time(job.id),
        "last_run": last_run,
        "last_success_at": last_success_at,
        "health": compute_health(job, last_run, last_finished, last_success_at, now),
        "history": history,
        "success_rate_30d": success_30d.count() / total_30d if total_30d else None,
        "avg_duration_30d": avg_duration,
    }
