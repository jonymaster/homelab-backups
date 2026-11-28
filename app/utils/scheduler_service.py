import logging
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.base import JobLookupError
from apscheduler.triggers.cron import CronTrigger
from db.session import SessionLocal
from models.models import BackupJob
from utils.backup_utils import execute_backup, try_mark_running

scheduler = BackgroundScheduler()
scheduler.start()

def run_scheduled_backup(job_id):
    with SessionLocal() as db:
        job = db.get(BackupJob, job_id)
        if job is None or job.paused:
            logging.info(f"Skipping scheduled run of job {job_id}: paused or deleted")
            return
        if not try_mark_running(db, job_id):
            logging.info(f"Skipping scheduled run of job {job_id}: already running")
            return
    execute_backup(job_id)

def add_job(job_id, schedule, paused=False):
    # next_run_time=None adds the job to the scheduler in paused state.
    extra = {"next_run_time": None} if paused else {}
    scheduler.add_job(run_scheduled_backup, CronTrigger.from_crontab(schedule), args=[job_id],
                      id=f"backup-{job_id}", replace_existing=True, **extra)

def remove_job(job_id):
    try:
        scheduler.remove_job(f"backup-{job_id}")
    except JobLookupError:
        pass

def schedule_all_jobs():
    with SessionLocal() as db:
        jobs = db.query(BackupJob).all()

    for job in jobs:
        try:
            add_job(job.id, job.schedule, job.paused)
        except ValueError as e:
            logging.error(f"Not scheduling job {job.id}: invalid schedule {job.schedule!r}: {e}")

def next_run_time(job_id) -> Optional[datetime]:
    job = scheduler.get_job(f"backup-{job_id}")
    return job.next_run_time if job else None

def fire_times(schedule: str, count: int) -> list[datetime]:
    """Next `count` fire times of a cron schedule, or [] if it is invalid."""
    try:
        trigger = CronTrigger.from_crontab(schedule)
    except ValueError:
        return []
    times = []
    now = datetime.now(trigger.timezone)
    previous = None
    for _ in range(count):
        previous = trigger.get_next_fire_time(previous, now if previous is None else previous)
        if previous is None:
            break
        times.append(previous)
    return times

def schedule_interval(schedule: str) -> Optional[timedelta]:
    times = fire_times(schedule, 2)
    return times[1] - times[0] if len(times) == 2 else None
