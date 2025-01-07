from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import BackupJob
from app.utils.backup_utils import execute_backup

scheduler = BackgroundScheduler()
scheduler.start()

def add_job(job_id, job_func, cron_args, source, destination):
    scheduler.add_job(job_func, 'cron', args=[source, destination], id=f"backup-{job_id}", replace_existing=True, **cron_args)

def remove_job(job_id):
    scheduler.remove_job(f"backup-{job_id}")

def parse_schedule(schedule_str):
    # Convert a cron-like schedule string into schedule kwargs
    return {"minute": schedule_str.split()[0], "hour": schedule_str.split()[1]}

def schedule_all_jobs():
    db: Session = next(get_db())
    jobs = db.query(BackupJob).all()

    for job in jobs:
        cron_args = parse_schedule(job.schedule)
        add_job(job.id, execute_backup, cron_args, job.source, job.destination)