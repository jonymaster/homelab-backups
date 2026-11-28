import os
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from db.session import get_db
from models.models import BackupJob, BackupResult
from models.schemas import BackupJobCreate, JobRead, JobStats, Snapshot
from utils import repository
from utils.job_summary import NEWEST_FIRST, job_summary
from utils.scheduler_service import add_job, remove_job
from utils.backup_utils import execute_backup, try_mark_running

router = APIRouter()

CHART_SIZE = 30

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

def get_job_or_404(db: Session, job_id: int) -> BackupJob:
    job = db.get(BackupJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/jobs", response_model=JobRead)
@router.post("/jobs/", response_model=JobRead)
def create_backup_job(job: BackupJobCreate, db: Session = Depends(get_db)):
    check_conflicts(db, job)
    db_job = BackupJob(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    add_job(db_job.id, job.schedule)

    return job_summary(db, db_job)

@router.put("/jobs/{job_id}", response_model=JobRead)
@router.put("/jobs/{job_id}/", response_model=JobRead)
def update_backup_job(job_id: int, updated_job: BackupJobCreate, db: Session = Depends(get_db)):
    db_job = get_job_or_404(db, job_id)
    check_conflicts(db, updated_job, exclude_id=job_id)

    db_job.name = updated_job.name
    db_job.source = updated_job.source
    db_job.destination = updated_job.destination
    db_job.schedule = updated_job.schedule

    db.commit()
    db.refresh(db_job)

    remove_job(job_id)
    add_job(db_job.id, updated_job.schedule, db_job.paused)

    return job_summary(db, db_job)

@router.get("/jobs", response_model=List[JobRead])
@router.get("/jobs/", response_model=List[JobRead])
def get_all_backup_jobs(db: Session = Depends(get_db)):
    return [job_summary(db, job) for job in db.query(BackupJob).order_by(BackupJob.id).all()]

@router.get("/jobs/{job_id}", response_model=JobRead)
@router.get("/jobs/{job_id}/", response_model=JobRead)
def get_backup_job(job_id: int, db: Session = Depends(get_db)):
    return job_summary(db, get_job_or_404(db, job_id))

def set_paused(db: Session, job_id: int, paused: bool) -> dict:
    job = get_job_or_404(db, job_id)
    job.paused = paused
    db.commit()
    try:
        add_job(job.id, job.schedule, paused)
    except ValueError:
        pass  # Legacy invalid schedule: nothing to (re)schedule.
    return job_summary(db, job)

@router.post("/jobs/{job_id}/pause", response_model=JobRead)
@router.post("/jobs/{job_id}/pause/", response_model=JobRead)
def pause_backup_job(job_id: int, db: Session = Depends(get_db)):
    return set_paused(db, job_id, True)

@router.post("/jobs/{job_id}/resume", response_model=JobRead)
@router.post("/jobs/{job_id}/resume/", response_model=JobRead)
def resume_backup_job(job_id: int, db: Session = Depends(get_db)):
    return set_paused(db, job_id, False)

@router.get("/jobs/{job_id}/stats", response_model=JobStats)
@router.get("/jobs/{job_id}/stats/", response_model=JobStats)
def get_job_stats(job_id: int, db: Session = Depends(get_db)):
    job = get_job_or_404(db, job_id)
    runs = db.query(BackupResult).filter(BackupResult.job_id == job_id)
    successes = runs.filter(BackupResult.status == "success")
    chart = successes.order_by(*NEWEST_FIRST).limit(CHART_SIZE).all()[::-1]
    snapshots = repository.list_snapshots(job.destination)
    return {
        "total_runs": runs.count(),
        "success_runs": successes.count(),
        "failed_runs": runs.filter(BackupResult.status == "failed").count(),
        "backup_size_bytes": repository.directory_size(job.destination),
        "snapshot_count": len(snapshots),
        "oldest_snapshot": snapshots[-1] if snapshots else None,
        "chart": [
            {"started_at": r.started_at, "size_change_bytes": r.size_change_bytes,
             "duration_seconds": r.duration_seconds}
            for r in chart
        ],
    }

@router.get("/jobs/{job_id}/snapshots", response_model=List[Snapshot])
@router.get("/jobs/{job_id}/snapshots/", response_model=List[Snapshot])
def get_job_snapshots(job_id: int, db: Session = Depends(get_db)):
    job = get_job_or_404(db, job_id)
    return [{"at": at} for at in repository.list_snapshots(job.destination)]

@router.post("/jobs/{job_id}/execute", response_model=dict)
@router.post("/jobs/{job_id}/execute/", response_model=dict)
def execute_backup_job(job_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    get_job_or_404(db, job_id)
    if not try_mark_running(db, job_id):
        raise HTTPException(status_code=409, detail="Job is already running")

    background_tasks.add_task(execute_backup, job_id)

    return {"message": "Backup job execution started"}

@router.delete("/jobs/{job_id}", response_model=dict)
@router.delete("/jobs/{job_id}/", response_model=dict)
def delete_backup_job(job_id: int, db: Session = Depends(get_db)):
    job = get_job_or_404(db, job_id)
    db.query(BackupResult).filter(BackupResult.job_id == job_id).delete()
    db.delete(job)
    db.commit()

    remove_job(job_id)

    return {"message": "Job deleted successfully"}
