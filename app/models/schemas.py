from pydantic import BaseModel
from typing import Optional

class BackupJobBase(BaseModel):
    source: str
    destination: str
    schedule: str

class BackupJobRead(BackupJobBase):
    id: int

    class Config:
        from_attributes = True

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str

class BackupResultRead(BackupResultBase):
    id: int

    class Config:
        from_attributes = True