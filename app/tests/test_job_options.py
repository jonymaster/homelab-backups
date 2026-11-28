import subprocess
from unittest.mock import patch

import pytest

from conftest import job_payload
from models.models import BackupJob, BackupResult
from utils.backup_utils import execute_backup, ping
from utils.excludes import exclude_args


def create(client, **overrides):
    response = client.post("/jobs", json=job_payload(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


def test_exclude_presets_endpoint(client):
    presets = client.get("/exclude-presets").json()
    assert [p["id"] for p in presets] == ["caches", "temp", "node_modules", "trash"]
    assert presets[0] == {"id": "caches", "label": "Caches and thumbnails",
                          "patterns": ["**/.cache", "**/cache", "**/thumbs", "**/.thumbnails"]}
    assert client.get("/exclude-presets/").json() == presets


def test_create_uses_settings_defaults(client):
    job = create(client)
    assert job["retention_days"] == 180
    assert job["exclude_presets"] == ["caches", "temp", "trash"]
    assert job["exclude_patterns"] == []
    assert job["notify"] == "default"
    assert job["ping_url"] is None

    client.put("/settings", json={"defaults": {"retention_days": None, "exclude_patterns": ["**/*.log"]}})
    job = create(client, name="docs", destination="/app/destination/docs")
    assert job["retention_days"] is None
    assert job["exclude_patterns"] == ["**/*.log"]


def test_create_with_explicit_values(client):
    job = create(client, retention_days=None, exclude_presets=[], exclude_patterns=[" a/b ", "a/b"],
                 notify="always", ping_url="https://hc-ping.com/abc")
    assert job["retention_days"] is None
    assert job["exclude_presets"] == []
    assert job["exclude_patterns"] == ["a/b"]
    assert job["notify"] == "always"
    assert job["ping_url"] == "https://hc-ping.com/abc"


def test_update_keeps_omitted_fields(client):
    job = create(client, retention_days=7, notify="never", ping_url="https://hc/x")
    response = client.put(f"/jobs/{job['id']}", json=job_payload(name="renamed"))
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["name"] == "renamed"
    assert (updated["retention_days"], updated["notify"], updated["ping_url"]) == (7, "never", "https://hc/x")

    updated = client.put(f"/jobs/{job['id']}", json=job_payload(retention_days=None, ping_url="",
                                                                 exclude_presets=["node_modules"])).json()
    assert updated["retention_days"] is None
    assert updated["ping_url"] is None
    assert updated["exclude_presets"] == ["node_modules"]


@pytest.mark.parametrize("overrides", [
    {"retention_days": 0},
    {"exclude_presets": ["nope"]},
    {"exclude_patterns": [""]},
    {"notify": "sometimes"},
    {"ping_url": "hc-ping.com/abc"},
])
def test_job_validation(client, overrides):
    assert client.post("/jobs", json=job_payload(**overrides)).status_code == 422


def test_exclude_args():
    args = exclude_args("/app/source/photos/", ["trash", "caches"], ["**/*.log", "tmp", "/raw/x", "/app/source/photos/y"])
    globs = args[1::2]
    assert args[0::2] == ["--exclude"] * len(globs)
    # Preset order follows the preset list, then custom patterns anchored at the source root.
    assert globs[:4] == ["**/.cache", "**/cache", "**/thumbs", "**/.thumbnails"]
    assert globs[4] == "**/.Trash*"
    assert globs[-4:] == ["**/*.log", "/app/source/photos/tmp", "/app/source/photos/raw/x", "/app/source/photos/y"]
    assert exclude_args("/s", [], []) == []


def make_job(db, **values):
    job = BackupJob(name="j", source="/src", destination="/dst", schedule="0 2 * * *", **values)
    db.add(job)
    db.commit()
    return job.id


def completed(returncode=0, stdout=""):
    return subprocess.CompletedProcess([], returncode, stdout=stdout)


def test_backup_command_with_excludes_and_retention(db):
    job_id = make_job(db, exclude_presets=["node_modules"], exclude_patterns=["*.iso"], retention_days=30)
    with patch("utils.backup_utils.subprocess.run",
               side_effect=[completed(stdout="backup ok\n"), completed(stdout="NOTE: Deleting increments\n")]) as run:
        assert execute_backup(job_id)[0] == "success"
    backup, retention = run.call_args_list
    assert backup.args[0] == ["rdiff-backup", "--api-version", "201", "backup", "--print-statistics",
                              "--exclude", "**/node_modules", "--exclude", "/src/*.iso", "/src", "/dst"]
    assert retention.args[0] == ["rdiff-backup", "--api-version", "201", "--force", "remove", "increments",
                                 "--older-than", "30D", "/dst"]
    log = db.query(BackupResult).one().log
    assert "backup ok" in log
    assert "Retention: removing increments older than 30 days" in log
    assert "NOTE: Deleting increments" in log


@pytest.mark.parametrize("returncode, error", [(0, False), (2, False), (1, True)])
def test_retention_result_never_fails_run(db, returncode, error):
    job_id = make_job(db, retention_days=1)
    with patch("utils.backup_utils.subprocess.run",
               side_effect=[completed(stdout="ok\n"), completed(returncode, "WARNING: nothing\n")]):
        assert execute_backup(job_id)[0] == "success"
    run = db.query(BackupResult).one()
    assert run.status == "success"
    assert ("RETENTION ERROR: rdiff-backup exited with code 1" in run.log) == error


def test_retention_exception_logged(db):
    job_id = make_job(db, retention_days=1)
    with patch("utils.backup_utils.subprocess.run", side_effect=[completed(stdout="ok"), OSError("disk gone")]):
        assert execute_backup(job_id)[0] == "success"
    assert "RETENTION ERROR: disk gone" in db.query(BackupResult).one().log


def test_no_retention_on_failure_or_when_unset(db):
    failing = make_job(db, retention_days=1)
    error = subprocess.CalledProcessError(1, "rdiff-backup", output="boom")
    with patch("utils.backup_utils.subprocess.run", side_effect=error) as run:
        execute_backup(failing)
    assert run.call_count == 1

    db.query(BackupJob).update({"retention_days": None})
    db.commit()
    with patch("utils.backup_utils.subprocess.run", return_value=completed(stdout="ok")) as run:
        execute_backup(failing)
    assert run.call_count == 1


def test_ping_on_success_and_failure(db):
    job_id = make_job(db, ping_url="https://hc-ping.com/abc/")
    with patch("utils.backup_utils.subprocess.run", return_value=completed(stdout="ok")), \
            patch("utils.backup_utils.urllib.request.urlopen") as urlopen:
        execute_backup(job_id)
    request = urlopen.call_args.args[0]
    assert request.full_url == "https://hc-ping.com/abc/"
    assert urlopen.call_args.kwargs == {"timeout": 5}

    error = subprocess.CalledProcessError(1, "rdiff-backup", output="boom")
    with patch("utils.backup_utils.subprocess.run", side_effect=error), \
            patch("utils.backup_utils.urllib.request.urlopen") as urlopen:
        execute_backup(job_id)
    assert urlopen.call_args.args[0].full_url == "https://hc-ping.com/abc/fail"


def test_ping_errors_only_logged(db):
    job_id = make_job(db, ping_url="https://hc-ping.com/abc")
    with patch("utils.backup_utils.subprocess.run", return_value=completed(stdout="ok")), \
            patch("utils.backup_utils.urllib.request.urlopen", side_effect=TimeoutError("timed out")):
        assert execute_backup(job_id)[0] == "success"
    with patch("utils.backup_utils.urllib.request.urlopen", side_effect=OSError("refused")):
        ping("http://x", "failed")


def test_no_ping_without_url(db):
    job_id = make_job(db)
    with patch("utils.backup_utils.subprocess.run", return_value=completed(stdout="ok")), \
            patch("utils.backup_utils.urllib.request.urlopen") as urlopen:
        execute_backup(job_id)
    urlopen.assert_not_called()
