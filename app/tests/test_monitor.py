from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from models.models import BackupJob, BackupResult, NotificationChannel, NotificationLog
from utils.monitor import run_checks
from utils.notifications import notify_run
from utils.settings import update_settings

GB = 1024 ** 3


@pytest.fixture
def sent(db):
    db.add(NotificationChannel(name="Hook", type="apprise", enabled=True, config={"url": "json://localhost/x"}))
    db.commit()
    with patch("utils.notifications.send", return_value=None) as mock, \
            patch("utils.monitor.disk_usage", return_value=[]):
        yield mock


def titles(sent):
    return [c.args[1] for c in sent.call_args_list]


def make_job(db, name="Photos", **values):
    job = BackupJob(name=name, source="/src", destination=f"/dst/{name}", schedule="0 2 * * *", **values)
    db.add(job)
    db.commit()
    return job.id


def add_run(db, job_id, status, at):
    run = BackupResult(job_id=job_id, status=status, started_at=at, finished_at=at, duration_seconds=1)
    db.add(run)
    db.commit()
    return run.id


def test_stale_once_per_episode(db, sent):
    now = datetime.now()
    job_id = make_job(db)
    add_run(db, job_id, "success", now - timedelta(days=3))

    run_checks(now)
    run_checks(now + timedelta(minutes=10))
    assert titles(sent) == ["Photos: backup is stale"]
    assert db.query(NotificationLog).one().event == "job_stale"

    # A success ends the episode; the next stale episode notifies again.
    notify_run(add_run(db, job_id, "success", now))
    run_checks(now)
    assert sent.call_count == 1
    run_checks(now + timedelta(days=3))
    assert titles(sent) == ["Photos: backup is stale"] * 2


def test_paused_and_healthy_jobs_never_stale(db, sent):
    now = datetime.now()
    paused = make_job(db, "Paused", paused=True)
    add_run(db, paused, "success", now - timedelta(days=10))
    healthy = make_job(db, "Healthy")
    add_run(db, healthy, "success", now - timedelta(hours=5))
    run_checks(now)
    assert sent.call_count == 0


def test_stale_respects_notify_mode(db, sent):
    now = datetime.now()
    update_settings(db, {"notifications": {"events": {"job_stale": False}}})
    for name, notify in (("Default", "default"), ("Always", "always"), ("Never", "never")):
        add_run(db, make_job(db, name, notify=notify), "success", now - timedelta(days=3))
    run_checks(now)
    assert titles(sent) == ["Always: backup is stale"]


def disk(used_percent):
    total = 100 * GB
    used = used_percent * GB
    return [{"path": "/app/destination", "total_bytes": total, "used_bytes": used, "free_bytes": total - used}]


def test_disk_low_at_most_once_per_day(db, sent):
    now = datetime.now()
    with patch("utils.monitor.disk_usage", return_value=disk(95)):
        run_checks(now)
        run_checks(now + timedelta(hours=23))
        assert titles(sent) == ["Disk almost full: /app/destination"]
        run_checks(now + timedelta(hours=25))
        assert sent.call_count == 2
    assert "95% used, 5.0 GB free of 100.0 GB" in sent.call_args.args[2]


def test_disk_low_rearms_after_recovery(db, sent):
    now = datetime.now()
    with patch("utils.monitor.disk_usage", return_value=disk(85)):
        run_checks(now)
    assert sent.call_count == 0
    with patch("utils.monitor.disk_usage", return_value=disk(91)):
        run_checks(now)
    with patch("utils.monitor.disk_usage", return_value=disk(50)):
        run_checks(now + timedelta(hours=1))
    with patch("utils.monitor.disk_usage", return_value=disk(92)):
        run_checks(now + timedelta(hours=2))
    assert sent.call_count == 2

    update_settings(db, {"monitoring": {"disk_warning_percent": 95}})
    with patch("utils.monitor.disk_usage", return_value=disk(94)):
        run_checks(now + timedelta(days=2))
    assert sent.call_count == 2


def test_disk_low_toggle(db, sent):
    update_settings(db, {"notifications": {"events": {"disk_low": False}}})
    with patch("utils.monitor.disk_usage", return_value=disk(99)):
        run_checks(datetime.now())
    assert sent.call_count == 0


def test_weekly_summary_timing(db, sent):
    update_settings(db, {"notifications": {"events": {"weekly_summary": True},
                                           "weekly_summary_day": 2, "weekly_summary_time": "09:30"}})
    wednesday = datetime(2026, 11, 25, 9, 0)
    job_id = make_job(db)
    add_run(db, job_id, "success", wednesday - timedelta(days=1))
    add_run(db, job_id, "failed", wednesday - timedelta(days=2))
    add_run(db, job_id, "success", wednesday - timedelta(days=9))

    run_checks(wednesday)                                    # before the time
    run_checks(wednesday - timedelta(days=1, hours=-1))      # wrong day
    assert sent.call_count == 0

    run_checks(wednesday.replace(hour=9, minute=35))
    run_checks(wednesday.replace(hour=9, minute=45))
    run_checks(wednesday.replace(hour=23))
    assert titles(sent) == ["Homelab Backups: weekly summary"]
    assert sent.call_args.args[2].startswith("Photos: 2 runs, 1 succeeded, 1 failed")

    run_checks(wednesday + timedelta(days=7, minutes=31))
    assert titles(sent).count("Homelab Backups: weekly summary") == 2


def test_weekly_summary_off_by_default(db, sent):
    update_settings(db, {"notifications": {"weekly_summary_day": 2}})
    run_checks(datetime(2026, 11, 25, 10, 0))
    assert sent.call_count == 0


def test_check_failure_does_not_stop_other_checks(db, sent):
    make_job(db)
    with patch("utils.monitor.job_summary", side_effect=RuntimeError("boom")), \
            patch("utils.monitor.disk_usage", return_value=disk(99)):
        run_checks(datetime.now())
    assert titles(sent) == ["Disk almost full: /app/destination"]
