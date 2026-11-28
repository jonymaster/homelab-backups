from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
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
    retention_days = Column(Integer)
    exclude_presets = Column(JSON, nullable=False, default=list, server_default="[]")
    exclude_patterns = Column(JSON, nullable=False, default=list, server_default="[]")
    notify = Column(String, nullable=False, default="default", server_default="default")
    ping_url = Column(String)
    # Set when a stale notification is sent, cleared by the next success.
    stale_notified_at = Column(DateTime)

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


class Setting(Base):
    __tablename__ = 'settings'

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)

class NotificationChannel(Base):
    __tablename__ = 'notification_channels'

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default="1")
    config = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

class NotificationLog(Base):
    __tablename__ = 'notification_log'

    id = Column(Integer, primary_key=True)
    at = Column(DateTime, nullable=False, index=True)
    event = Column(String, nullable=False)
    job_id = Column(Integer)
    job_name = Column(String)
    title = Column(String, nullable=False)
    ok = Column(Boolean, nullable=False)
    error = Column(Text)

class NotificationState(Base):
    """Last time a deduplicated notification was sent, by key (e.g. "disk_low:/path")."""
    __tablename__ = 'notification_state'

    key = Column(String, primary_key=True)
    sent_at = Column(DateTime, nullable=False)
