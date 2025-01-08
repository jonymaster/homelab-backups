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
        from_attributes = True  # Use Configuration Class for Pydantic V2

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str

class BackupResultRead(BackupResultBase):
    id: int

    class Config:
        from_attributes = True  # Ensure ORM mode functionality