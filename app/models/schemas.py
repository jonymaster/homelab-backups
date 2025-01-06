from pydantic import BaseModel
from typing import Optional

class BackupJobBase(BaseModel):
    source: str
    destination: str
    schedule: str

class BackupJobCreate(BackupJobBase):
    pass

class BackupJobRead(BackupJobBase):
    id: int

    class Config:
        orm_mode = True

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str

class BackupResultCreate(BackupResultBase):
    job_id: int

class BackupResultRead(BackupResultBase):
    id: int
    job_id: int

    class Config:
        orm_mode = True