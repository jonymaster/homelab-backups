from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
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
    paused = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=datetime.now)

    results = relationship('BackupResult', back_populates='backup_job')

class BackupResult(Base):
    __tablename__ = 'backup_results'

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey('backup_jobs.id'))
    # Legacy columns, still written for the deprecated /results endpoints.
    timestamp = Column(String, index=True)
    status = Column(String, index=True)
    result = Column(String, index=True)
    details = Column(String, index=True)

    started_at = Column(DateTime, index=True)
    finished_at = Column(DateTime)
    duration_seconds = Column(Float)
    source_files = Column(Integer)
    source_size_bytes = Column(Integer)
    new_files = Column(Integer)
    changed_files = Column(Integer)
    deleted_files = Column(Integer)
    size_change_bytes = Column(Integer)
    increment_size_bytes = Column(Integer)
    errors = Column(Integer)
    log = Column(Text)

    backup_job = relationship('BackupJob', back_populates='results')
