import re
import subprocess
import logging
from sqlalchemy.orm import Session
from db.session import SessionLocal
from models.models import BackupJob, BackupResult
from datetime import datetime
from utils import repository

STAT_COLUMNS = {
    "SourceFiles": "source_files",
    "SourceFileSize": "source_size_bytes",
    "NewFiles": "new_files",
    "ChangedFiles": "changed_files",
    "DeletedFiles": "deleted_files",
    "IncrementFileSize": "increment_size_bytes",
    "TotalDestinationSizeChange": "size_change_bytes",
    "Errors": "errors",
}
STAT_LINE = re.compile(r"^(\w+) (-?\d+(?:\.\d+)?)\b")


def parse_statistics(output: str) -> dict:
    """Parse the "Session statistics" block printed by `rdiff-backup backup --print-statistics`."""
    stats = {}
    in_block = False
    for line in output.splitlines():
        if "[ Session statistics ]" in line:
            in_block = True
            continue
        if not in_block:
            continue
        match = STAT_LINE.match(line)
        if not match:
            if line.startswith("---"):
                break
            continue
        key, value = match.groups()
        if key in STAT_COLUMNS:
            stats[STAT_COLUMNS[key]] = int(float(value))
        elif key == "StartTime":
            stats["started_at"] = datetime.fromtimestamp(float(value))
        elif key == "EndTime":
            stats["finished_at"] = datetime.fromtimestamp(float(value))
        elif key == "ElapsedTime":
            stats["duration_seconds"] = float(value)
    return stats


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
    """Mark jobs and runs left running by a previous process as failed."""
    with SessionLocal() as db:
        db.query(BackupJob).filter(BackupJob.status == "running").update({"status": "failed"})
        db.query(BackupResult).filter(BackupResult.status == "running").update(
            {"status": "failed", "result": "Backup interrupted"})
        db.commit()

def execute_backup(job_id: int):
    with SessionLocal() as db:
        job = db.query(BackupJob).filter_by(id=job_id).first()
        if not job:
            logging.error(f"No job found with ID: {job_id}")
            return "failed", f"No job found with ID: {job_id}"

        started_at = datetime.now()
        job.status = "running"
        run = BackupResult(job_id=job_id, status="running", started_at=started_at,
                           timestamp=started_at.isoformat(), result="Backup running", details="")
        db.add(run)
        db.commit()

        status = "failed"
        message = "Backup failed"
        output = ""
        try:
            command = [
                "rdiff-backup", "--api-version", "201", "backup", "--print-statistics",
                job.source, job.destination
            ]
            result = subprocess.run(command, check=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True)

            status = "success"
            message = "Backup successful"
            output = result.stdout
        except subprocess.CalledProcessError as e:
            output = e.output or ""
        except Exception as e:
            logging.exception(f"Backup job {job_id} errored")
            output = str(e)
        finally:
            finished_at = datetime.now()
            values = {
                "started_at": started_at,
                "finished_at": finished_at,
                "duration_seconds": (finished_at - started_at).total_seconds(),
                **parse_statistics(output),
                "status": status,
                "result": message,
                "details": output,
                "log": output,
            }
            for key, value in values.items():
                setattr(run, key, value)
            job.status = status
            db.commit()
            repository.invalidate(job.destination)

        logging.info(message)

        return status, message
