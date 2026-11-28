"""Periodic checks that notify about stale jobs, low disk space and the weekly summary."""
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from db.session import SessionLocal
from models.models import BackupJob, BackupResult, NotificationState
from utils.disks import disk_usage
from utils.job_summary import job_summary
from utils.notifications import deliver, human_bytes, wants
from utils.settings import get_settings

logger = logging.getLogger(__name__)

DISK_REPEAT = timedelta(hours=24)


def get_state(db: Session, key: str) -> Optional[datetime]:
    state = db.get(NotificationState, key)
    return state.sent_at if state else None


def set_state(db: Session, key: str, at: Optional[datetime]):
    state = db.get(NotificationState, key)
    if at is None:
        if state:
            db.delete(state)
    elif state:
        state.sent_at = at
    else:
        db.add(NotificationState(key=key, sent_at=at))
    db.commit()


def check_stale(db: Session, settings, now: datetime):
    for job in db.query(BackupJob).filter(BackupJob.paused.is_(False), BackupJob.stale_notified_at.is_(None)):
        summary = job_summary(db, job, now)
        if summary["health"] != "stale":
            continue
        job.stale_notified_at = now
        db.commit()
        if wants(job, "job_stale", settings):
            last = summary["last_success_at"]
            body = f"No successful backup since {last:%Y-%m-%d %H:%M}." if last else "No successful backup yet."
            base_url = settings.general.base_url
            if base_url:
                body += f"\n{base_url}/jobs/view?id={job.id}"
            deliver(db, "job_stale", f"{job.name}: backup is stale", body, job)


def check_disks(db: Session, settings, now: datetime):
    threshold = settings.monitoring.disk_warning_percent
    for disk in disk_usage():
        key = f"disk_low:{disk['path']}"
        percent = 100 * disk["used_bytes"] / disk["total_bytes"] if disk["total_bytes"] else 0
        if percent < threshold:
            set_state(db, key, None)
            continue
        last = get_state(db, key)
        if not settings.notifications.events.disk_low or (last and now - last < DISK_REPEAT):
            continue
        set_state(db, key, now)
        deliver(db, "disk_low", f"Disk almost full: {disk['path']}",
                f"{percent:.0f}% used, {human_bytes(disk['free_bytes'])} free "
                f"of {human_bytes(disk['total_bytes'])} (warning at {threshold}%).")


def summary_due(settings, now: datetime, last_sent: Optional[datetime]) -> Optional[datetime]:
    """This week's summary time if it is due today and not sent yet."""
    hour, minute = map(int, settings.notifications.weekly_summary_time.split(":"))
    if now.weekday() != settings.notifications.weekly_summary_day:
        return None
    scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < scheduled or (last_sent and last_sent >= scheduled):
        return None
    return scheduled


def weekly_summary(db: Session, now: datetime) -> str:
    since = now - timedelta(days=7)
    lines = []
    for job in db.query(BackupJob).order_by(BackupJob.name):
        statuses = [s for (s,) in db.query(BackupResult.status).filter(
            BackupResult.job_id == job.id, BackupResult.started_at >= since,
            BackupResult.status.in_(("success", "failed")))]
        lines.append(f"{job.name}: {len(statuses)} runs, {statuses.count('success')} succeeded, "
                     f"{statuses.count('failed')} failed" + (" (paused)" if job.paused else ""))
    if not lines:
        lines.append("No backup jobs.")
    for disk in disk_usage():
        percent = 100 * disk["used_bytes"] / disk["total_bytes"] if disk["total_bytes"] else 0
        lines.append(f"Disk {disk['path']}: {percent:.0f}% used, {human_bytes(disk['free_bytes'])} free")
    return "\n".join(lines)


def check_weekly_summary(db: Session, settings, now: datetime):
    if not settings.notifications.events.weekly_summary:
        return
    if summary_due(settings, now, get_state(db, "weekly_summary")) is None:
        return
    set_state(db, "weekly_summary", now)
    deliver(db, "weekly_summary", "Homelab Backups: weekly summary", weekly_summary(db, now))


def run_checks(now: Optional[datetime] = None):
    now = now or datetime.now()
    with SessionLocal() as db:
        settings = get_settings(db)
        for check in (check_stale, check_disks, check_weekly_summary):
            try:
                check(db, settings, now)
            except Exception:
                logger.exception(f"Monitoring check {check.__name__} failed")
                db.rollback()
