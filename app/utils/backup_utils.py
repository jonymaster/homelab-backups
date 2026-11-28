import subprocess
import logging
from sqlalchemy.orm import Session
from db.session import SessionLocal
from models.models import BackupJob, BackupResult
from datetime import datetime

def try_mark_running(db: Session, job_id: int) -> bool:
    """Atomically set the job to running. Returns False if it was already running."""
    updated = (
        db.query(BackupJob)
        .filter(BackupJob.id == job_id, BackupJob.status != "running")
        .update({"status": "running"})
    )
    db.commit()
    return updated == 1

def reset_stale_jobs():
    """Mark jobs left running by a previous process as failed."""
    with SessionLocal() as db:
        db.query(BackupJob).filter(BackupJob.status == "running").update({"status": "failed"})
        db.commit()

def execute_backup(job_id: int):
    with SessionLocal() as db:
        job = db.query(BackupJob).filter_by(id=job_id).first()
        if not job:
            logging.error(f"No job found with ID: {job_id}")
            return "failed", f"No job found with ID: {job_id}"

        job.status = "running"
        db.commit()

        status = "failed"
        message = "Backup failed"
        details = ""
        try:
            command = [
                "rdiff-backup", "--api-version", "201", "backup",
                job.source, job.destination
            ]
            result = subprocess.run(command, check=True, capture_output=True, text=True)

            status = "success"
            message = "Backup successful"
            details = result.stdout
        except subprocess.CalledProcessError as e:
            details = e.stderr
        except Exception as e:
            logging.exception(f"Backup job {job_id} errored")
            details = str(e)
        finally:
            job.status = status
            db.add(BackupResult(job_id=job_id, timestamp=datetime.now().isoformat(), status=status, result=message, details=details))
            db.commit()

        logging.info(message)

        return status, message
