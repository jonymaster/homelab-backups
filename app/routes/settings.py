from fastapi import APIRouter, Body, Depends
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from db.session import get_db
from utils.settings import Settings, get_settings, update_settings

router = APIRouter()


@router.get("/settings", response_model=Settings)
@router.get("/settings/", response_model=Settings)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings", response_model=Settings)
@router.put("/settings/", response_model=Settings)
def write_settings(patch: dict = Body(...), db: Session = Depends(get_db)):
    try:
        return update_settings(db, patch)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False, include_context=False))
