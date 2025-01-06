from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import BackupJob
from app.models.schemas import BackupJobCreate, BackupJobRead
from app.utils.backup_scripts import create_backup_script
from app.utils.cron_manager import schedule_crontab

router = APIRouter(prefix="/jobs")

@router.post("/", response_model=BackupJobRead)
def create_job(job: BackupJobCreate, db: Session = Depends(get_db)):
    # Create the backup job in the database
    db_job = BackupJob(**job.dict())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    try:
        # Create and schedule the backup script
        script_path = create_backup_script(db_job)
        schedule_crontab(db_job, script_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error scheduling job: {str(e)}")

    return db_job

@router.get("/", response_model=List[BackupJobRead])
def list_jobs(db: Session = Depends(get_db)):
    return db.query(BackupJob).all()

@router.get("/{job_id}", response_model=BackupJobRead)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.delete("/{job_id}", response_model=dict)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"message": "Job deleted successfully"}