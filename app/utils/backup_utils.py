import subprocess
import logging
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import BackupJob, BackupResult
from datetime import datetime

def execute_backup(job_id):
    db: Session = next(get_db())
    job = db.query(BackupJob).filter_by(id=job_id).first()
    if not job:
        logging.error(f"No job found with ID: {job_id}")
        return "failed", f"No job found with ID: {job_id}"  # Return tuple on error

    # Update job status as running
    job.status = "running"
    db.commit()

    try:
        # Simulate backup with rdiff-backup
        command = ["rdiff-backup", job.source, job.destination]
        result = subprocess.run(command, check=True, capture_output=True, text=True)

        # Log success result
        status = "success"
        message = f"Backup successful: {result.stdout}"
    except subprocess.CalledProcessError as e:
        # Log error
        status = "failed"
        message = f"Backup failed: {e.stderr}"

    # Update job status to completed or failed and log result
    job.status = "complete" if status == "success" else "failed"
    job_result = BackupResult(job_id=job_id, timestamp=datetime.now().isoformat(), status=status, result=message)
    db.add(job_result)
    db.commit()

    logging.info(message)

    return status, message  # Ensure consistent return of (status, message) tuple