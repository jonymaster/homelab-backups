import os
import subprocess
from datetime import datetime
from unittest.mock import patch

from models.models import BackupJob, BackupResult
from utils.backup_utils import execute_backup, parse_statistics

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name):
    with open(os.path.join(FIXTURES, name)) as f:
        return f.read()


def test_parse_real_output():
    assert parse_statistics(fixture("backup_statistics.txt")) == {
        "started_at": datetime.fromtimestamp(1795839004.95),
        "finished_at": datetime.fromtimestamp(1795839004.99),
        "duration_seconds": 0.04,
        "source_files": 3,
        "source_size_bytes": 50007,
        "new_files": 1,
        "changed_files": 2,
        "deleted_files": 1,
        "increment_size_bytes": 208,
        "size_change_bytes": 209,
        "errors": 0,
    }


def test_parse_negative_size_change():
    output = "--------------[ Session statistics ]--------------\nTotalDestinationSizeChange -1024 (-1 KB)\n----\n"
    assert parse_statistics(output) == {"size_change_bytes": -1024}


def test_parse_without_statistics():
    assert parse_statistics("ERROR: something broke\nSourceFiles 3\n") == {}
    assert parse_statistics("") == {}


def make_job(db):
    job = BackupJob(name="j", source="/src", destination="/dst", schedule="0 2 * * *")
    db.add(job)
    db.commit()
    return job.id


def test_execute_stores_statistics_and_log(db):
    job_id = make_job(db)
    output = fixture("backup_statistics.txt")
    with patch("utils.backup_utils.subprocess.run") as run:
        run.return_value = subprocess.CompletedProcess([], 0, stdout=output)
        assert execute_backup(job_id)[0] == "success"
    command = run.call_args.args[0]
    assert command == ["rdiff-backup", "--api-version", "201", "backup", "--print-statistics", "/src", "/dst"]

    result = db.query(BackupResult).one()
    assert result.status == "success"
    assert result.log == output
    assert result.source_files == 3
    assert result.size_change_bytes == 209
    assert result.duration_seconds == 0.04
    assert result.started_at == datetime.fromtimestamp(1795839004.95)


def test_execute_failure_uses_wall_clock(db):
    job_id = make_job(db)
    before = datetime.now()
    error = subprocess.CalledProcessError(1, "rdiff-backup", output="ERROR: nope")
    with patch("utils.backup_utils.subprocess.run", side_effect=error):
        execute_backup(job_id)
    result = db.query(BackupResult).one()
    assert result.status == "failed"
    assert result.log == "ERROR: nope"
    assert before <= result.started_at <= result.finished_at
    assert result.duration_seconds >= 0
    assert result.source_files is None
