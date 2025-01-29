import subprocess
import logging
from sqlalchemy.orm import Session
from db.session import get_db
from models.models import BackupJob, BackupResult
from datetime import datetime

def execute_backup(job_id):
    db: Session = next(get_db())
    job = db.query(BackupJob).filter_by(id=job_id).first()
    if not job:
        logging.error(f"No job found with ID: {job_id}")
        return "failed", f"No job found with ID: {job_id}"

    job.status = "running"
    db.commit()

    try:
        command = [
            "rdiff-backup", "--api-version", "201", "backup",
            job.source, job.destination
        ]
        result = subprocess.run(command, check=True, capture_output=True, text=True)

        status = "success"
        message = f"Backup successful"
        details = result.stdout
    except subprocess.CalledProcessError as e:
        status = "failed"
        message = f"Backup failed"
        details = e.stderr

    job.status = "completed" if status == "success" else "failed"
    job_result = BackupResult(job_id=job_id, timestamp=datetime.now().isoformat(), status=status, result=message, details=details)
    db.add(job_result)
    db.commit()

    logging.info(message)

    return status, message