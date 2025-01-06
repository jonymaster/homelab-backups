from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import BackupResult
from app.models.schemas import BackupResultCreate, BackupResultRead

router = APIRouter(prefix="/results")

@router.post("/results/", response_model=BackupResultRead)
def create_result(result: BackupResultCreate, db: Session = Depends(get_db)):
    db_result = BackupResult(**result.dict())
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return db_result

@router.get("/results/", response_model=List[BackupResultRead])
def list_results(db: Session = Depends(get_db)):
    return db.query(BackupResult).all()

@router.get("/results/{result_id}", response_model=BackupResultRead)
def get_result(result_id: int, db: Session = Depends(get_db)):
    result = db.query(BackupResult).filter(BackupResult.id == result_id).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    return result

@router.get("/jobs/{job_id}/results/", response_model=List[BackupResultRead])
def get_results_for_job(job_id: int, db: Session = Depends(get_db)):
    results = db.query(BackupResult).filter(BackupResult.job_id == job_id).all()
    if not results:
        raise HTTPException(status_code=404, detail="No results found for this job")
    return results