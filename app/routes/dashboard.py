import os
import shutil
from collections import Counter
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from tzlocal import get_localzone_name
from db.session import get_db
from models.models import BackupJob, BackupResult
from models.schemas import Dashboard, ServerInfo
from utils.job_summary import FINISHED, job_summary
from utils.scheduler_service import fire_times

router = APIRouter()

UPCOMING_SIZE = 5
CALENDAR_DAYS = 30

def disk_usage():
    disks = []
    for path in os.getenv("DISK_PATHS", "/app/destination").split(","):
        path = path.strip()
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        disks.append({"path": path, "total_bytes": usage.total, "used_bytes": usage.used, "free_bytes": usage.free})
    return disks

def calendar(db: Session, jobs: list[BackupJob], today: date):
    first_day = today - timedelta(days=CALENDAR_DAYS - 1)
    days = [first_day + timedelta(days=i) for i in range(CALENDAR_DAYS)]
    statuses: dict[tuple[int, date], set[str]] = {}
    rows = (
        db.query(BackupResult.job_id, BackupResult.started_at, BackupResult.status)
        .filter(BackupResult.status.in_(FINISHED),
                BackupResult.started_at >= datetime.combine(first_day, datetime.min.time()))
        .all()
    )
    for job_id, started_at, status in rows:
        statuses.setdefault((job_id, started_at.date()), set()).add(status)

    def day_status(job_id, day):
        found = statuses.get((job_id, day), set())
        return "failed" if "failed" in found else "success" if "success" in found else "none"

    return [
        {"job_id": job.id, "job_name": job.name,
         "days": [{"date": day.isoformat(), "status": day_status(job.id, day)} for day in days]}
        for job in jobs
    ]

@router.get("/dashboard", response_model=Dashboard)
@router.get("/dashboard/", response_model=Dashboard)
def get_dashboard(db: Session = Depends(get_db)):
    now = datetime.now()
    jobs = db.query(BackupJob).order_by(BackupJob.id).all()
    health = Counter(job_summary(db, job, now)["health"] for job in jobs)

    recent = db.query(BackupResult.status).filter(
        BackupResult.status.in_(FINISHED), BackupResult.started_at >= now - timedelta(days=30))
    run_counts = Counter(status for (status,) in recent)

    upcoming = sorted(
        ({"job_id": job.id, "job_name": job.name, "at": at}
         for job in jobs if not job.paused for at in fire_times(job.schedule, UPCOMING_SIZE)),
        key=lambda item: item["at"],
    )[:UPCOMING_SIZE]

    return {
        "jobs": {"total": len(jobs), **{key: health[key] for key in ("healthy", "failing", "stale", "running", "paused")}},
        "runs_30d": {"total": run_counts.total(), "success": run_counts["success"], "failed": run_counts["failed"]},
        "upcoming": upcoming,
        "disks": disk_usage(),
        "calendar": calendar(db, jobs, now.date()),
    }

@router.get("/server", response_model=ServerInfo)
@router.get("/server/", response_model=ServerInfo)
def get_server():
    return {"time": datetime.now().astimezone(), "timezone": get_localzone_name(),
            "version": os.getenv("APP_VERSION", "dev")}
