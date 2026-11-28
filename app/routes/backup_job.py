import os
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from db.session import get_db
from models.models import BackupJob, BackupResult
from models.schemas import BackupJobCreate, BackupJobRead
from utils.scheduler_service import add_job, remove_job
from utils.backup_utils import execute_backup, try_mark_running

router = APIRouter()

def check_conflicts(db: Session, job: BackupJobCreate, exclude_id: Optional[int] = None):
    destination = os.path.normpath(job.destination)
    for other in db.query(BackupJob).filter(BackupJob.id != exclude_id).all():
        if other.name == job.name:
            raise HTTPException(status_code=409, detail=f"A job named '{job.name}' already exists")
        if os.path.normpath(other.destination) == destination:
            raise HTTPException(
                status_code=409,
                detail=f"Destination '{job.destination}' is already used by job '{other.name}'",
            )

@router.post("/jobs", response_model=BackupJobRead)
@router.post("/jobs/", response_model=BackupJobRead)
def create_backup_job(job: BackupJobCreate, db: Session = Depends(get_db)):
    check_conflicts(db, job)
    db_job = BackupJob(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    add_job(db_job.id, job.schedule)

    return db_job

@router.put("/jobs/{job_id}", response_model=BackupJobRead)
@router.put("/jobs/{job_id}/", response_model=BackupJobRead)
def update_backup_job(job_id: int, updated_job: BackupJobCreate, db: Session = Depends(get_db)):
    db_job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    check_conflicts(db, updated_job, exclude_id=job_id)

    db_job.name = updated_job.name
    db_job.source = updated_job.source
    db_job.destination = updated_job.destination
    db_job.schedule = updated_job.schedule

    db.commit()
    db.refresh(db_job)

    remove_job(job_id)
    add_job(db_job.id, updated_job.schedule)

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
def execute_backup_job(job_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not try_mark_running(db, job_id):
        raise HTTPException(status_code=409, detail="Job is already running")

    background_tasks.add_task(execute_backup, job_id)

    return {"message": "Backup job execution started"}

@router.delete("/jobs/{job_id}", response_model=dict)
@router.delete("/jobs/{job_id}/", response_model=dict)
def delete_backup_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    db.query(BackupResult).filter(BackupResult.job_id == job_id).delete()
    db.delete(job)
    db.commit()

    remove_job(job_id)

    return {"message": "Job deleted successfully"}
