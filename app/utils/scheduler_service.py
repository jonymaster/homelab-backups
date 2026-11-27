import logging
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
        if not try_mark_running(db, job_id):
            logging.info(f"Skipping scheduled run of job {job_id}: already running")
            return
    execute_backup(job_id)

def add_job(job_id, schedule):
    scheduler.add_job(run_scheduled_backup, CronTrigger.from_crontab(schedule), args=[job_id],
                      id=f"backup-{job_id}", replace_existing=True)

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
            add_job(job.id, job.schedule)
        except ValueError as e:
            logging.error(f"Not scheduling job {job.id}: invalid schedule {job.schedule!r}: {e}")
