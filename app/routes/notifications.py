from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from db.session import get_db
from models.models import NotificationChannel, NotificationLog
from models.schemas import LocalDatetime
from utils.notifications import CHANNEL_TYPES, build_apprise_url, clean_config, mask_config, test_channel

router = APIRouter(prefix="/notifications")


class ChannelCreate(BaseModel):
    name: str
    type: str
    enabled: bool = True
    config: dict = {}


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[dict] = None


class ChannelRead(BaseModel):
    id: int
    name: str
    type: str
    enabled: bool
    config: dict
    created_at: Optional[LocalDatetime]


class TestRequest(BaseModel):
    type: str
    config: dict = {}


class TestResult(BaseModel):
    ok: bool
    error: Optional[str]


class LogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: LocalDatetime
    event: str
    job_id: Optional[int]
    job_name: Optional[str]
    title: str
    ok: bool
    error: Optional[str]


def to_read(channel: NotificationChannel) -> dict:
    return {"id": channel.id, "name": channel.name, "type": channel.type, "enabled": channel.enabled,
            "config": mask_config(channel.type, channel.config), "created_at": channel.created_at}


def validated_config(type: str, config: dict, stored: Optional[dict] = None) -> dict:
    try:
        cleaned = clean_config(type, config, stored)
        build_apprise_url(type, cleaned)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return cleaned


def validated_name(name: str) -> str:
    if not name.strip():
        raise HTTPException(status_code=422, detail="Name is required")
    return name.strip()


def get_channel_or_404(db: Session, channel_id: int) -> NotificationChannel:
    channel = db.get(NotificationChannel, channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


@router.get("/channel-types")
@router.get("/channel-types/")
def get_channel_types():
    return CHANNEL_TYPES


@router.get("/channels", response_model=list[ChannelRead])
@router.get("/channels/", response_model=list[ChannelRead])
def list_channels(db: Session = Depends(get_db)):
    return [to_read(c) for c in db.query(NotificationChannel).order_by(NotificationChannel.id)]


@router.post("/channels", response_model=ChannelRead)
@router.post("/channels/", response_model=ChannelRead)
def create_channel(body: ChannelCreate, db: Session = Depends(get_db)):
    channel = NotificationChannel(name=validated_name(body.name), type=body.type, enabled=body.enabled,
                                  config=validated_config(body.type, body.config), created_at=datetime.now())
    db.add(channel)
    db.commit()
    return to_read(channel)


@router.put("/channels/{channel_id}", response_model=ChannelRead)
@router.put("/channels/{channel_id}/", response_model=ChannelRead)
def update_channel(channel_id: int, body: ChannelUpdate, db: Session = Depends(get_db)):
    channel = get_channel_or_404(db, channel_id)
    if body.name is not None:
        channel.name = validated_name(body.name)
    if body.enabled is not None:
        channel.enabled = body.enabled
    if body.config is not None:
        channel.config = validated_config(channel.type, {**channel.config, **body.config}, channel.config)
    db.commit()
    return to_read(channel)


@router.delete("/channels/{channel_id}")
@router.delete("/channels/{channel_id}/")
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    db.delete(get_channel_or_404(db, channel_id))
    db.commit()
    return {"message": "Channel deleted"}


@router.post("/channels/{channel_id}/test", response_model=TestResult)
@router.post("/channels/{channel_id}/test/", response_model=TestResult)
def test_saved_channel(channel_id: int, db: Session = Depends(get_db)):
    channel = get_channel_or_404(db, channel_id)
    error = test_channel(db, channel.name, channel.type, channel.config)
    return {"ok": error is None, "error": error}


@router.post("/test", response_model=TestResult)
@router.post("/test/", response_model=TestResult)
def test_unsaved_channel(body: TestRequest, db: Session = Depends(get_db)):
    try:
        config = clean_config(body.type, body.config)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    error = test_channel(db, body.type, body.type, config)
    return {"ok": error is None, "error": error}


@router.get("/log", response_model=list[LogEntry])
@router.get("/log/", response_model=list[LogEntry])
def get_log(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    return db.query(NotificationLog).order_by(NotificationLog.at.desc(), NotificationLog.id.desc()).limit(limit).all()
