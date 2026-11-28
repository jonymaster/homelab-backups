import io
import json
import sqlite3
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
import yaml

from conftest import job_payload
from models.models import BackupJob, BackupResult, NotificationChannel
from routes import maintenance


def create_job(client, **overrides):
    response = client.post("/jobs", json=job_payload(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


# Metrics

def test_metrics_disabled_by_default(client):
    assert client.get("/metrics").status_code == 404


def test_metrics(client, db):
    client.put("/settings", json={"monitoring": {"metrics_enabled": True}})
    job = create_job(client, name='Pho"tos')
    create_job(client, name="docs", destination="/app/destination/docs")
    client.post(f"/jobs/{job['id']}/pause")
    finished = datetime(2026, 11, 1, 2, 0, 30)
    db.add(BackupResult(job_id=job["id"], status="success", started_at=finished - timedelta(seconds=30),
                        finished_at=finished, duration_seconds=30))
    db.add(BackupResult(job_id=job["id"], status="failed", started_at=finished + timedelta(days=1),
                        finished_at=finished + timedelta(days=1, seconds=5), duration_seconds=5.5))
    db.commit()
    disks = [{"path": "/app/destination", "total_bytes": 1000, "used_bytes": 400, "free_bytes": 600}]
    with patch("routes.maintenance.disk_usage", return_value=disks), \
            patch("routes.maintenance.repository.directory_size", return_value=12345):
        response = client.get("/metrics/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    lines = response.text.splitlines()
    label = 'job="Pho\\"tos"'
    assert f"homelab_backups_last_success_timestamp_seconds{{{label}}} {finished.timestamp()}" in lines
    assert f"homelab_backups_last_run_duration_seconds{{{label}}} 5.5" in lines
    assert f"homelab_backups_last_run_success{{{label}}} 0" in lines
    assert f"homelab_backups_job_paused{{{label}}} 1" in lines
    assert 'homelab_backups_job_paused{job="docs"} 0' in lines
    assert f"homelab_backups_backup_size_bytes{{{label}}} 12345" in lines
    assert 'homelab_backups_disk_free_bytes{path="/app/destination"} 600' in lines
    assert 'homelab_backups_disk_total_bytes{path="/app/destination"} 1000' in lines
    assert "# TYPE homelab_backups_last_run_success gauge" in lines
    assert not any(line.startswith('homelab_backups_last_run_success{job="docs"}') for line in lines)


# Export / import

def test_export(client, db):
    client.put("/settings", json={"general": {"clock": "12h"}})
    create_job(client, retention_days=7, exclude_patterns=["**/*.iso"], notify="always", ping_url="https://hc/x")
    client.post("/notifications/channels", json={"name": "Phone", "type": "ntfy",
                                                 "config": {"topic": "t", "token": "tk_secret"}})
    response = client.get("/export")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == "attachment; filename=homelab-backups-export.yaml"
    assert "tk_secret" not in response.text
    data = yaml.safe_load(response.text)
    assert data["version"] == 1
    assert data["settings"]["general"]["clock"] == "12h"
    assert data["jobs"] == [{
        "name": "photos", "source": "/app/source/photos", "destination": "/app/destination/photos",
        "schedule": "0 2 * * *", "paused": False, "retention_days": 7,
        "exclude_presets": ["caches", "temp", "trash"], "exclude_patterns": ["**/*.iso"], "notify": "always",
        "ping_url": "https://hc/x"}]
    assert data["channels"] == [{"name": "Phone", "type": "ntfy", "enabled": True,
                                 "config": {"server_url": "https://ntfy.sh", "topic": "t"}}]


def upload(client, content: str):
    return client.post("/import", files={"file": ("export.yaml", io.BytesIO(content.encode()), "application/yaml")})


def test_import_round_trip(client, db):
    client.put("/settings", json={"general": {"clock": "12h"}, "defaults": {"retention_days": 30}})
    job = create_job(client, retention_days=None, exclude_presets=["node_modules"], notify="never")
    client.post(f"/jobs/{job['id']}/pause")
    client.post("/notifications/channels", json={"name": "Phone", "type": "ntfy", "config": {"topic": "t"}})
    client.post("/notifications/channels", json={"name": "Chat", "type": "telegram",
                                                 "config": {"bot_token": "1:x", "chat_id": "5"}})
    exported = client.get("/export").text

    for model in (BackupResult, BackupJob, NotificationChannel):
        db.query(model).delete()
    db.commit()
    client.put("/settings", json={"general": {"clock": "24h"}})

    result = upload(client, exported).json()
    assert result == {"jobs_created": 1, "jobs_skipped": [], "channels_created": 2, "settings_applied": True,
                      "errors": []}
    expected = yaml.safe_load(exported)
    expected["channels"][1]["enabled"] = False
    assert yaml.safe_load(client.get("/export").text) == expected
    imported = client.get("/jobs").json()[0]
    assert (imported["paused"], imported["retention_days"], imported["notify"]) == (True, None, "never")
    channels = {c["name"]: c for c in client.get("/notifications/channels").json()}
    assert channels["Phone"]["enabled"] is True        # no secret needed
    assert channels["Chat"]["enabled"] is False        # bot token was not exported
    assert channels["Chat"]["config"]["bot_token"] == ""

    again = upload(client, exported).json()
    assert again["jobs_created"] == 0 and again["jobs_skipped"] == ["photos"] and again["channels_created"] == 0


def test_import_partial_errors(client):
    create_job(client)
    content = yaml.safe_dump({
        "version": 1,
        "settings": {"general": {"clock": "99h"}},
        "jobs": [
            {"name": "photos", "source": "/s", "destination": "/d", "schedule": "0 2 * * *"},
            {"name": "dup-dest", "source": "/s", "destination": "/app/destination/photos", "schedule": "0 2 * * *"},
            {"name": "bad", "source": "/s", "destination": "/d2", "schedule": "nope"},
            {"name": "new", "source": "/s", "destination": "/d3", "schedule": "0 4 * * *"},
            "garbage",
        ],
        "channels": [{"name": "X", "type": "fax", "config": {}}, {"name": "Y", "type": "ntfy"}],
    })
    result = upload(client, content).json()
    assert result["jobs_created"] == 1
    assert result["jobs_skipped"] == ["photos"]
    assert result["channels_created"] == 0
    assert result["settings_applied"] is False
    assert len(result["errors"]) == 6
    assert any("already used by job" in e for e in result["errors"])
    new = next(j for j in client.get("/jobs").json() if j["name"] == "new")
    assert new["retention_days"] == 180  # omitted fields take the defaults


def test_import_invalid_file(client):
    assert upload(client, "a: [").status_code == 422
    assert upload(client, "- just a list").status_code == 422


# Database backup

def test_backup_db(client, tmp_path):
    create_job(client)
    response = client.get("/backup/db")
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="homelab-backups-')
    assert disposition.endswith('.db"')
    path = tmp_path / "check.db"
    with open(path, "wb") as f:
        f.write(response.content)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT name FROM backup_jobs").fetchall() == [("photos",)]
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone() == ("0003",)


# Updates

@pytest.fixture(autouse=True)
def clear_update_cache():
    maintenance._update_cache.clear()


def github_response(tag="v0.4.1"):
    response = MagicMock()
    response.__enter__.return_value = io.BytesIO(json.dumps(
        {"tag_name": tag, "html_url": f"https://github.com/jonymaster/homelab-backups/releases/tag/{tag}"}).encode())
    return response


def test_updates_available_and_cached(client, monkeypatch):
    monkeypatch.setenv("APP_VERSION", "0.4.0")
    with patch("routes.maintenance.urllib.request.urlopen", return_value=github_response()) as urlopen:
        first = client.get("/updates").json()
        second = client.get("/updates/").json()
    assert urlopen.call_count == 1
    assert urlopen.call_args.kwargs == {"timeout": 5}
    assert first == second
    assert first["current"] == "0.4.0"
    assert first["latest"] == "0.4.1"
    assert first["update_available"] is True
    assert first["release_url"].endswith("/v0.4.1")
    assert datetime.fromisoformat(first["checked_at"]).tzinfo is not None

    maintenance._update_cache["at"] -= maintenance.UPDATE_TTL + 1
    with patch("routes.maintenance.urllib.request.urlopen", return_value=github_response("v0.4.0")) as urlopen:
        assert client.get("/updates").json()["update_available"] is False
    assert urlopen.call_count == 1


def test_updates_error_and_dev(client, monkeypatch):
    monkeypatch.setenv("APP_VERSION", "dev")
    with patch("routes.maintenance.urllib.request.urlopen", side_effect=TimeoutError()):
        result = client.get("/updates").json()
    assert result["latest"] is None and result["update_available"] is False and result["release_url"] is None

    maintenance._update_cache.clear()
    with patch("routes.maintenance.urllib.request.urlopen", return_value=github_response("v9.9.9")):
        result = client.get("/updates").json()
    assert result["latest"] == "9.9.9" and result["update_available"] is False


def test_updates_disabled(client, monkeypatch):
    monkeypatch.setenv("APP_VERSION", "0.4.0")
    client.put("/settings", json={"maintenance": {"update_check": False}})
    with patch("routes.maintenance.urllib.request.urlopen") as urlopen:
        result = client.get("/updates").json()
    urlopen.assert_not_called()
    assert result == {"current": "0.4.0", "latest": None, "update_available": False, "release_url": None,
                      "checked_at": None}


def test_is_newer():
    assert maintenance.is_newer("0.10.0", "0.9.1")
    assert not maintenance.is_newer("0.4.0", "0.4.0")
    assert not maintenance.is_newer("garbage", "0.4.0")
