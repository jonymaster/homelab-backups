import os
import subprocess
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest

from conftest import job_payload
from models.models import BackupJob, BackupResult
from utils.scheduler_service import run_scheduled_backup, scheduler

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
JOB_FIELDS = {
    "id", "name", "source", "destination", "schedule", "status", "paused", "created_at", "next_run",
    "last_run", "last_success_at", "health", "history", "success_rate_30d", "avg_duration_30d", "retention_days",
    "exclude_presets", "exclude_patterns", "notify", "ping_url",
}
RUN_FIELDS = {
    "id", "job_id", "job_name", "status", "started_at", "finished_at", "duration_seconds", "source_files",
    "source_size_bytes", "new_files", "changed_files", "deleted_files", "size_change_bytes",
    "increment_size_bytes", "errors",
}


def create_job(client, **overrides):
    response = client.post("/jobs", json=job_payload(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


def add_run(db, job_id, status="success", ago=timedelta(hours=1), **values):
    started_at = datetime.now() - ago
    run = BackupResult(job_id=job_id, status=status, started_at=started_at,
                       finished_at=started_at + timedelta(seconds=10), duration_seconds=10,
                       timestamp=started_at.isoformat(), result="", details="", **values)
    db.add(run)
    db.commit()
    return run.id


def set_job(db, job_id, **values):
    db.query(BackupJob).filter_by(id=job_id).update(values)
    db.commit()


def increments_output():
    with open(os.path.join(FIXTURES, "list_increments.txt")) as f:
        return f.read()


# Jobs

def test_new_job_summary(client):
    job = create_job(client)
    assert set(job) == JOB_FIELDS
    assert job["health"] == "new"
    assert job["paused"] is False
    assert job["history"] == []
    assert job["last_run"] is None
    assert job["last_success_at"] is None
    assert job["success_rate_30d"] is None
    assert job["avg_duration_30d"] is None
    assert datetime.fromisoformat(job["created_at"]).tzinfo is not None
    next_run = datetime.fromisoformat(job["next_run"])
    assert (next_run.hour, next_run.minute) == (2, 0)
    assert client.get("/jobs").json() == [job]
    assert client.get(f"/jobs/{job['id']}/").json() == job


def test_job_summary_with_runs(client, db):
    job = create_job(client)
    for days in range(20, 0, -1):
        add_run(db, job["id"], "failed" if days % 5 == 0 else "success", ago=timedelta(days=days),
                size_change_bytes=days)
    add_run(db, job["id"], "success", ago=timedelta(days=40))
    last = add_run(db, job["id"], "success", ago=timedelta(hours=2), size_change_bytes=7)

    summary = client.get(f"/jobs/{job['id']}").json()
    assert summary["health"] == "healthy"
    assert len(summary["history"]) == 14
    assert summary["history"][-1] == "success"
    assert summary["history"][-6:] == ["failed", "success", "success", "success", "success", "success"]
    assert summary["last_run"]["id"] == last
    assert summary["last_run"]["size_change_bytes"] == 7
    assert set(summary["last_run"]) == {"id", "status", "started_at", "duration_seconds", "size_change_bytes"}
    assert summary["success_rate_30d"] == pytest.approx(17 / 21)
    assert summary["avg_duration_30d"] == pytest.approx(10)
    assert datetime.fromisoformat(summary["last_success_at"]) > datetime.now().astimezone() - timedelta(hours=3)


@pytest.mark.parametrize("runs, status, expected", [
    ([("success", timedelta(hours=1)), ("failed", timedelta(minutes=5))], "failed", "failing"),
    ([("failed", timedelta(hours=1)), ("success", timedelta(minutes=5))], "success", "healthy"),
    ([("success", timedelta(days=3))], "success", "stale"),
    ([("success", timedelta(hours=40))], "success", "healthy"),
    ([("success", timedelta(days=3)), ("running", timedelta(minutes=1))], "running", "running"),
])
def test_health(client, db, runs, status, expected):
    job = create_job(client)
    for run_status, ago in runs:
        add_run(db, job["id"], run_status, ago=ago)
    set_job(db, job["id"], status=status)
    assert client.get(f"/jobs/{job['id']}").json()["health"] == expected


def test_legacy_completed_status_reported_as_success(client, db):
    job = create_job(client)
    add_run(db, job["id"], "completed")
    set_job(db, job["id"], status="completed")
    summary = client.get(f"/jobs/{job['id']}").json()
    assert summary["status"] == "success"
    assert summary["last_run"]["status"] == "success"
    assert client.get("/runs").json()["items"][0]["status"] == "success"


# Pause / resume

def test_pause_and_resume(client, db):
    job = create_job(client)
    add_run(db, job["id"])
    paused = client.post(f"/jobs/{job['id']}/pause").json()
    assert paused["paused"] is True
    assert paused["health"] == "paused"
    assert paused["next_run"] is None
    assert scheduler.get_job(f"backup-{job['id']}").next_run_time is None

    updated = client.put(f"/jobs/{job['id']}", json=job_payload(schedule="0 4 * * *")).json()
    assert updated["paused"] is True
    assert scheduler.get_job(f"backup-{job['id']}").next_run_time is None

    resumed = client.post(f"/jobs/{job['id']}/resume/").json()
    assert resumed["paused"] is False
    assert resumed["health"] == "healthy"
    assert datetime.fromisoformat(resumed["next_run"]).hour == 4
    assert client.post("/jobs/999/pause").status_code == 404


def test_scheduler_skips_paused_job(client, db):
    job = create_job(client)
    client.post(f"/jobs/{job['id']}/pause")
    with patch("utils.scheduler_service.execute_backup") as execute:
        run_scheduled_backup(job["id"])
    execute.assert_not_called()
    assert db.get(BackupJob, job["id"]).status == "pending"


def test_manual_run_allowed_when_paused(client):
    job = create_job(client)
    client.post(f"/jobs/{job['id']}/pause")
    with patch("routes.backup_job.execute_backup") as execute:
        assert client.post(f"/jobs/{job['id']}/execute").status_code == 200
    execute.assert_called_once_with(job["id"])


def test_startup_keeps_paused_jobs_paused(client, db):
    from utils.scheduler_service import schedule_all_jobs
    job = create_job(client)
    set_job(db, job["id"], paused=True)
    scheduler.remove_all_jobs()
    schedule_all_jobs()
    assert scheduler.get_job(f"backup-{job['id']}").next_run_time is None


# Runs

def test_runs_pagination_and_filters(client, db):
    photos = create_job(client)
    docs = create_job(client, name="docs", destination="/app/destination/docs")
    ids = []
    for i in range(25):
        job = photos if i % 2 == 0 else docs
        ids.append(add_run(db, job["id"], "failed" if i % 3 == 0 else "success",
                           ago=timedelta(hours=30 - i), source_files=i))
    running = add_run(db, docs["id"], "running", ago=timedelta(minutes=1))
    ids.append(running)

    page = client.get("/runs").json()
    assert page["total"] == 26
    assert [r["id"] for r in page["items"]] == ids[::-1][:20]
    assert set(page["items"][0]) == RUN_FIELDS

    page = client.get("/runs/?limit=10&offset=20").json()
    assert [r["id"] for r in page["items"]] == ids[::-1][20:]

    page = client.get(f"/runs?job_id={photos['id']}&status=failed").json()
    assert page["total"] == 5
    assert all(r["job_name"] == "photos" and r["status"] == "failed" for r in page["items"])

    assert [r["id"] for r in client.get("/runs?status=running").json()["items"]] == [running]
    assert client.get("/runs?limit=101").status_code == 422
    assert client.get("/runs?status=completed").status_code == 422


def test_run_detail(client, db):
    job = create_job(client)
    run_id = add_run(db, job["id"], log="full output", source_files=3, size_change_bytes=-5)
    run = client.get(f"/runs/{run_id}").json()
    assert set(run) == RUN_FIELDS | {"log"}
    assert run["log"] == "full output"
    assert run["job_name"] == "photos"
    assert run["size_change_bytes"] == -5
    assert datetime.fromisoformat(run["started_at"]).tzinfo is not None
    assert client.get(f"/runs/{run_id}/").status_code == 200
    assert client.get("/runs/999").status_code == 404


# Stats and snapshots

def test_snapshots(client):
    job = create_job(client)
    with patch("utils.repository.subprocess.run") as run:
        run.return_value = subprocess.CompletedProcess([], 0, stdout=increments_output())
        snapshots = client.get(f"/jobs/{job['id']}/snapshots").json()
        client.get(f"/jobs/{job['id']}/snapshots/")
    assert run.call_count == 1  # cached
    assert run.call_args.args[0] == [
        "rdiff-backup", "--api-version", "201", "--parsable-output", "list", "increments", job["destination"]]
    assert [datetime.fromisoformat(s["at"]).timestamp() for s in snapshots] == [1795839004, 1795839002]


@pytest.mark.parametrize("result", [
    subprocess.CompletedProcess([], 1, stdout="", stderr="ERROR: not a repository"),
    FileNotFoundError("rdiff-backup"),
])
def test_snapshots_missing_repository(client, result):
    job = create_job(client)
    kwargs = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
    with patch("utils.repository.subprocess.run", **kwargs):
        assert client.get(f"/jobs/{job['id']}/snapshots").json() == []


def test_job_stats(client, db, tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "a").write_bytes(b"x" * 100)
    (tmp_path / "sub" / "b").write_bytes(b"x" * 50)
    job = create_job(client, destination=str(tmp_path))
    for i in range(35):
        add_run(db, job["id"], ago=timedelta(days=35 - i), size_change_bytes=i)
    add_run(db, job["id"], "failed")

    with patch("utils.repository.subprocess.run") as run:
        run.return_value = subprocess.CompletedProcess([], 0, stdout=increments_output())
        stats = client.get(f"/jobs/{job['id']}/stats/").json()

    assert stats["total_runs"] == 36
    assert stats["success_runs"] == 35
    assert stats["failed_runs"] == 1
    assert stats["backup_size_bytes"] == 150
    assert stats["snapshot_count"] == 2
    assert datetime.fromisoformat(stats["oldest_snapshot"]).timestamp() == 1795839002
    assert len(stats["chart"]) == 30
    assert [p["size_change_bytes"] for p in stats["chart"]] == list(range(5, 35))
    assert set(stats["chart"][0]) == {"started_at", "size_change_bytes", "duration_seconds"}


def test_job_stats_missing_destination(client):
    job = create_job(client, destination="/nonexistent/destination")
    with patch("utils.repository.subprocess.run", side_effect=FileNotFoundError):
        stats = client.get(f"/jobs/{job['id']}/stats").json()
    assert stats["backup_size_bytes"] is None
    assert stats["snapshot_count"] == 0
    assert stats["oldest_snapshot"] is None
    assert stats["chart"] == []


# Dashboard and server

def test_dashboard(client, db, tmp_path, monkeypatch):
    monkeypatch.setenv("DISK_PATHS", f"{tmp_path}, /nonexistent/disk")
    healthy = create_job(client, schedule="*/5 * * * *")
    failing = create_job(client, name="docs", destination="/app/destination/docs")
    paused = create_job(client, name="music", destination="/app/destination/music", schedule="* * * * *")
    create_job(client, name="new", destination="/app/destination/new", schedule="0 3 * * *")
    add_run(db, healthy["id"], ago=timedelta(minutes=2))
    add_run(db, failing["id"], "success", ago=timedelta(days=1))
    add_run(db, failing["id"], "failed", ago=timedelta(hours=1))
    add_run(db, failing["id"], "success", ago=timedelta(days=40))
    client.post(f"/jobs/{paused['id']}/pause")

    dashboard = client.get("/dashboard/").json()
    assert dashboard["jobs"] == {"total": 4, "healthy": 1, "failing": 1, "stale": 0, "running": 0, "paused": 1}
    assert dashboard["runs_30d"] == {"total": 3, "success": 2, "failed": 1}

    upcoming = dashboard["upcoming"]
    assert len(upcoming) == 5
    assert all(u["job_id"] != paused["id"] for u in upcoming)
    times = [datetime.fromisoformat(u["at"]) for u in upcoming]
    assert times == sorted(times)
    assert upcoming[0]["job_name"] == "photos"

    assert dashboard["disks"] == [{"path": str(tmp_path), **{
        k: v for k, v in dashboard["disks"][0].items() if k != "path"}}]
    assert dashboard["disks"][0]["total_bytes"] > 0

    rows = {row["job_name"]: row["days"] for row in dashboard["calendar"]}
    assert set(rows) == {"photos", "docs", "music", "new"}
    days = rows["docs"]
    assert len(days) == 30
    assert days[-1]["date"] == date.today().isoformat()
    assert days[0]["date"] == (date.today() - timedelta(days=29)).isoformat()
    by_date = {d["date"]: d["status"] for d in days}
    yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
    an_hour_ago = (datetime.now() - timedelta(hours=1)).date().isoformat()
    assert by_date[an_hour_ago] == "failed"
    if yesterday != an_hour_ago:
        assert by_date[yesterday] == "success"
    assert all(d["status"] == "none" for d in rows["new"])


def test_server(client, monkeypatch):
    assert client.get("/server").json()["version"] == "dev"
    monkeypatch.setenv("APP_VERSION", "1.2.3")
    server = client.get("/server/").json()
    assert server["version"] == "1.2.3"
    assert server["timezone"]
    assert abs(datetime.fromisoformat(server["time"]) - datetime.now().astimezone()) < timedelta(minutes=1)


def test_legacy_results_deprecated(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert paths["/results"]["get"]["deprecated"] is True
    assert paths["/jobs/{job_id}/results"]["get"]["deprecated"] is True
    assert "deprecated" not in paths["/runs"]["get"]
