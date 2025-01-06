from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import BackupJob
from app.models.schemas import BackupJobCreate, BackupJobRead
from utils.scheduler_service import add_job, remove_job
from app.utils.backup_utils import execute_backup

router = APIRouter(prefix="/jobs")

@router.post("/jobs/", response_model=BackupJobRead)
def create_job(job: BackupJob, db: Session = Depends(get_db)):
    db_job = BackupJob(**job.dict())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    # Schedule the backup
    cron_args = parse_schedule(job.schedule)
    add_job(db_job.id, execute_backup, cron_args, job.source_directory, job.destination_directory)
    
    return db_job

@router.delete("/jobs/{job_id}", response_model=dict)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()

    # Unschedule the job
    remove_job(job_id)

    return {"message": "Job deleted successfully"}

def parse_schedule(schedule_str: str):
    # Convert schedule string to cron arguments for APScheduler
    return {"minute": schedule_str.split()[0], "hour": schedule_str.split()[1]}
