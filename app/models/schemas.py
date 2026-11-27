from apscheduler.triggers.cron import CronTrigger
from pydantic import BaseModel, field_validator
from typing import Optional

class BackupJobBase(BaseModel):
    name: str
    source: str
    destination: str
    schedule: str

# Validation only on input, so reading legacy rows with a bad schedule still works.
class BackupJobCreate(BackupJobBase):
    @field_validator("schedule")
    @classmethod
    def validate_schedule(cls, value: str) -> str:
        try:
            CronTrigger.from_crontab(value)
        except ValueError as e:
            raise ValueError(f"Invalid cron schedule (expected 5 fields): {e}")
        return value

class BackupJobRead(BackupJobBase):
    id: int
    status: str

    class Config:
        from_attributes = True

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str
    details: str
    job_id: int

class BackupResultRead(BackupResultBase):
    id: int

    class Config:
        from_attributes = True
