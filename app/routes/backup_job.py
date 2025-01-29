from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
from db.session import get_db
from models.models import BackupJob, BackupResult
from models.schemas import BackupJobBase, BackupJobRead
from utils.scheduler_service import add_job, remove_job
from utils.backup_utils import execute_backup
from routes.backup_result import delete_results_for_job

router = APIRouter()

@router.post("/jobs", response_model=BackupJobRead)
@router.post("/jobs/", response_model=BackupJobRead)
def create_backup_job(job: BackupJobBase, db: Session = Depends(get_db)):
    db_job = BackupJob(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    cron_args = parse_schedule(job.schedule)
    add_job(db_job.id, cron_args)

    return db_job

@router.put("/jobs/{job_id}", response_model=BackupJobRead)
@router.put("/jobs/{job_id}/", response_model=BackupJobRead)
def update_backup_job(job_id: int, updated_job: BackupJobBase, db: Session = Depends(get_db)):
    db_job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    db_job.name = updated_job.name
    db_job.source = updated_job.source
    db_job.destination = updated_job.destination
    db_job.schedule = updated_job.schedule

    db.commit()
    db.refresh(db_job)

    remove_job(job_id)
    cron_args = parse_schedule(updated_job.schedule)
    add_job(db_job.id, cron_args)

    return db_job

@router.get("/jobs", response_model=List[BackupJobRead])
@router.get("/jobs/", response_model=List[BackupJobRead])
def get_all_backup_jobs(db: Session = Depends(get_db)):
    jobs = db.query(BackupJob).all()
    return jobs

@router.get("/jobs/{job_id}", response_model=BackupJobRead)
@router.get("/jobs/{job_id}/", response_model=BackupJobRead)
def get_backup_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    job_info = BackupJobRead.model_validate(job)
    return job_info

@router.post("/jobs/{job_id}/execute", response_model=dict)
@router.post("/jobs/{job_id}/execute/", response_model=dict)
def execute_backup_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    status, message = execute_backup(job.id)

    timestamp = datetime.now().isoformat()

    job_result = BackupResult(job_id=job.id, timestamp=timestamp, status=status, result=message)
    db.commit()

    return {"message": message}

@router.delete("/jobs/{job_id}", response_model=dict)
@router.delete("/jobs/{job_id}/", response_model=dict)
def delete_backup_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    delete_results_for_job(job_id, db)
    db.delete(job)
    db.commit()

    remove_job(job_id)

    return {"message": "Job deleted successfully"}

def parse_schedule(schedule_str: str):
    return {"minute": schedule_str.split()[0], "hour": schedule_str.split()[1]}