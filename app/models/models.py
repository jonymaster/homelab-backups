from sqlalchemy import Column, Integer, String
from app.db.session import Base

class BackupJob(Base):
    __tablename__ = 'backup_jobs'
    
    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, index=True)
    destination = Column(String, index=True)
    schedule = Column(String, index=True)