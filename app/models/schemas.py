from pydantic import BaseModel
from typing import Optional

class BackupJobBase(BaseModel):
    name: str
    source: str
    destination: str
    schedule: str

class BackupJobRead(BackupJobBase):
    id: int
    status: str

    class Config:
        from_attributes = True

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str
    job_id: int

class BackupResultRead(BackupResultBase):
    id: int

    class Config:
        from_attributes = True