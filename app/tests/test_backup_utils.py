import subprocess
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from models.models import BackupJob, BackupResult
from utils.backup_utils import execute_backup, reset_stale_jobs
from utils.scheduler_service import run_scheduled_backup


def make_job(db, status="pending"):
    job = BackupJob(name="j", source="/src", destination="/dst", schedule="0 2 * * *", status=status)
    db.add(job)
    db.commit()
    return job.id


def job_status(db, job_id):
    db.expire_all()
    return db.get(BackupJob, job_id).status


def test_success(db):
    job_id = make_job(db)
    with patch("utils.backup_utils.subprocess.run") as run:
        run.return_value.stdout = "ok"
        assert execute_backup(job_id)[0] == "success"
    assert job_status(db, job_id) == "success"


def test_called_process_error(db):
    job_id = make_job(db)
    error = subprocess.CalledProcessError(1, "rdiff-backup", stderr="boom")
    with patch("utils.backup_utils.subprocess.run", side_effect=error):
        assert execute_backup(job_id)[0] == "failed"
    assert job_status(db, job_id) == "failed"
    assert db.query(BackupResult).one().details == "boom"


def test_missing_binary_does_not_leave_running(db):
    job_id = make_job(db)
    with patch("utils.backup_utils.subprocess.run", side_effect=FileNotFoundError("rdiff-backup")):
        assert execute_backup(job_id)[0] == "failed"
    assert job_status(db, job_id) == "failed"
    result = db.query(BackupResult).one()
    assert result.status == "failed"
    assert "rdiff-backup" in result.details


def test_reset_stale_jobs(db):
    running = make_job(db, status="running")
    db.add(BackupJob(name="k", source="/s", destination="/d2", schedule="0 2 * * *", status="success"))
    db.commit()
    reset_stale_jobs()
    assert job_status(db, running) == "failed"
    assert db.query(BackupJob).filter_by(name="k").one().status == "success"


def test_startup_resets_stale_jobs(db):
    job_id = make_job(db, status="running")
    with TestClient(app):
        pass
    assert job_status(db, job_id) == "failed"


def test_scheduled_run_skips_when_running(db):
    job_id = make_job(db, status="running")
    with patch("utils.scheduler_service.execute_backup") as execute:
        run_scheduled_backup(job_id)
    execute.assert_not_called()


def test_scheduled_run_executes_when_idle(db):
    job_id = make_job(db)
    with patch("utils.backup_utils.subprocess.run") as run:
        run.return_value.stdout = "ok"
        run_scheduled_backup(job_id)
    run.assert_called_once()
    assert job_status(db, job_id) == "success"
