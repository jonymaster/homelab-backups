from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db.session import get_db
from models.models import BackupJob, BackupResult
from models.schemas import RunDetail, RunPage, RunRead
from utils.job_summary import NEWEST_FIRST

router = APIRouter()

def runs_query(db: Session):
    return db.query(BackupResult, BackupJob.name).outerjoin(BackupJob, BackupJob.id == BackupResult.job_id)

def to_run(schema, row):
    run, job_name = row
    return schema.model_validate({**run.__dict__, "job_name": job_name})

@router.get("/runs", response_model=RunPage)
@router.get("/runs/", response_model=RunPage)
def list_runs(
    job_id: Optional[int] = None,
    status: Optional[Literal["success", "failed", "running"]] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = runs_query(db)
    if job_id is not None:
        query = query.filter(BackupResult.job_id == job_id)
    if status is not None:
        query = query.filter(BackupResult.status == status)
    rows = query.order_by(*NEWEST_FIRST).offset(offset).limit(limit).all()
    return {"items": [to_run(RunRead, row) for row in rows], "total": query.count()}

@router.get("/runs/{run_id}", response_model=RunDetail)
@router.get("/runs/{run_id}/", response_model=RunDetail)
def get_run(run_id: int, db: Session = Depends(get_db)):
    row = runs_query(db).filter(BackupResult.id == run_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return to_run(RunDetail, row)
