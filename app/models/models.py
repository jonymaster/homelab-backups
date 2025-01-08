from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from db.session import Base

class BackupJob(Base):
    __tablename__ = 'backup_jobs'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    source = Column(String, index=True)
    destination = Column(String, index=True)
    schedule = Column(String, index=True)  # cron format
    status = Column(String, default="pending")

    results = relationship('BackupResult', back_populates='backup_job')

class BackupResult(Base):
    __tablename__ = 'backup_results'

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey('backup_jobs.id'))
    timestamp = Column(String, index=True)
    status = Column(String, index=True)
    result = Column(String, index=True)

    backup_job = relationship('BackupJob', back_populates='results')