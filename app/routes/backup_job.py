from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import BackupJob
from app.models.schemas import BackupJobCreate, BackupJobRead

router = APIRouter()

@router.post("/jobs/", response_model=BackupJobRead)
def create_job(job: BackupJobCreate, db: Session = Depends(get_db)):
    db_job = BackupJob(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

@router.get("/jobs/", response_model=List[BackupJobRead])
def list_jobs(db: Session = Depends(get_db)):
    return db.query(BackupJob).all()

@router.get("/jobs/{job_id}", response_model=BackupJobRead)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.delete("/jobs/{job_id}", response_model=dict)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"message": "Job deleted successfully"}