from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class BackupJob(Base):
    __tablename__ = 'backup_jobs'

    id = Column(Integer, primary_key=True, index=True)
    source_path = Column(String, nullable=False)
    destination_path = Column(String, nullable=False)
    schedule = Column(String, nullable=False)
    status = Column(Enum('pending', 'in-progress', 'completed', 'failed', name='job_status'), default='pending')
    result_details = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)

    user = relationship("User", back_populates="backup_jobs")

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    backup_jobs = relationship("BackupJob", back_populates="user")