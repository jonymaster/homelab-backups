from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.db.session import get_db
from models.models import BackupJob
from utils.backup_utils import execute_backup

scheduler = BackgroundScheduler()
scheduler.start()

def add_job(job_id, cron_args):
    scheduler.add_job(execute_backup, 'cron', args=[job_id],
                      id=f"backup-{job_id}", replace_existing=True, **cron_args)

def remove_job(job_id):
    scheduler.remove_job(f"backup-{job_id}")

def parse_schedule(schedule_str):
    return {
        "minute": schedule_str.split()[0],
        "hour": schedule_str.split()[1]
    }

def schedule_all_jobs():
    db: Session = next(get_db())
    jobs = db.query(BackupJob).all()

    for job in jobs:
        cron_args = parse_schedule(job.schedule)
        add_job(job.id, cron_args)