import json
import os
import sqlite3
import tempfile
import time
import urllib.request
from datetime import datetime
from typing import Optional

import yaml
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from db.session import engine, get_db
from models.models import BackupJob, BackupResult, NotificationChannel
from models.schemas import BackupJobCreate, LocalDatetime
from routes.backup_job import create_job
from utils import repository
from utils.disks import disk_usage
from utils.notifications import FIELDS, build_apprise_url, clean_config, without_secrets
from utils.settings import get_settings, update_settings

router = APIRouter()

EXPORT_VERSION = 1
JOB_EXPORT_FIELDS = ["name", "source", "destination", "schedule", "paused", "retention_days", "exclude_presets",
                     "exclude_patterns", "notify", "ping_url"]
RELEASES_URL = "https://api.github.com/repos/jonymaster/homelab-backups/releases/latest"
UPDATE_TTL = 6 * 3600
UPDATE_TIMEOUT = 5


# Metrics

def label(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


METRICS = [
    ("homelab_backups_last_success_timestamp_seconds", "Unix time of the last successful backup."),
    ("homelab_backups_last_run_duration_seconds", "Duration of the last finished run."),
    ("homelab_backups_last_run_success", "1 if the last finished run succeeded, else 0."),
    ("homelab_backups_job_paused", "1 if the job is paused."),
    ("homelab_backups_backup_size_bytes", "Size of the backup destination."),
    ("homelab_backups_disk_free_bytes", "Free space on the disk."),
    ("homelab_backups_disk_total_bytes", "Total size of the disk."),
]


def metric_samples(db: Session) -> dict[str, list[tuple[str, float]]]:
    samples = {name: [] for name, _ in METRICS}
    for job in db.query(BackupJob).order_by(BackupJob.id):
        labels = f'job="{label(job.name)}"'
        finished = (db.query(BackupResult)
                    .filter(BackupResult.job_id == job.id, BackupResult.status.in_(("success", "failed")))
                    .order_by(BackupResult.started_at.desc(), BackupResult.id.desc()))
        last = finished.first()
        last_success = finished.filter(BackupResult.status == "success").first()
        if last_success and (last_success.finished_at or last_success.started_at):
            at = last_success.finished_at or last_success.started_at
            samples["homelab_backups_last_success_timestamp_seconds"].append((labels, at.timestamp()))
        if last and last.duration_seconds is not None:
            samples["homelab_backups_last_run_duration_seconds"].append((labels, last.duration_seconds))
        if last:
            samples["homelab_backups_last_run_success"].append((labels, int(last.status == "success")))
        samples["homelab_backups_job_paused"].append((labels, int(job.paused)))
        size = repository.directory_size(job.destination)
        if size is not None:
            samples["homelab_backups_backup_size_bytes"].append((labels, size))
    for disk in disk_usage():
        labels = f'path="{label(disk["path"])}"'
        samples["homelab_backups_disk_free_bytes"].append((labels, disk["free_bytes"]))
        samples["homelab_backups_disk_total_bytes"].append((labels, disk["total_bytes"]))
    return samples


@router.get("/metrics", response_class=PlainTextResponse)
@router.get("/metrics/", response_class=PlainTextResponse)
def get_metrics(db: Session = Depends(get_db)):
    if not get_settings(db).monitoring.metrics_enabled:
        raise HTTPException(status_code=404, detail="Metrics are disabled")
    samples = metric_samples(db)
    lines = []
    for name, help_text in METRICS:
        lines += [f"# HELP {name} {help_text}", f"# TYPE {name} gauge"]
        lines += [f"{name}{{{labels}}} {value}" for labels, value in samples[name]]
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")


# Export / import

@router.get("/export")
@router.get("/export/")
def export_config(db: Session = Depends(get_db)):
    data = {
        "version": EXPORT_VERSION,
        "settings": get_settings(db).model_dump(),
        "jobs": [{key: getattr(job, key) for key in JOB_EXPORT_FIELDS}
                 for job in db.query(BackupJob).order_by(BackupJob.id)],
        "channels": [{"name": c.name, "type": c.type, "enabled": c.enabled,
                      "config": without_secrets(c.type, c.config)}
                     for c in db.query(NotificationChannel).order_by(NotificationChannel.id)],
    }
    return Response(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), media_type="application/yaml",
                    headers={"Content-Disposition": "attachment; filename=homelab-backups-export.yaml"})


class ImportResult(BaseModel):
    jobs_created: int
    jobs_skipped: list[str]
    channels_created: int
    settings_applied: bool
    errors: list[str]


def error_text(e: ValidationError) -> str:
    return "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors())


def import_jobs(db: Session, jobs: list, result: dict):
    existing = {name for (name,) in db.query(BackupJob.name)}
    for entry in jobs:
        if not isinstance(entry, dict):
            result["errors"].append(f"Invalid job entry: {entry!r}")
            continue
        name = entry.get("name")
        if name in existing:
            result["jobs_skipped"].append(name)
            continue
        try:
            job = BackupJobCreate.model_validate({k: v for k, v in entry.items() if k != "paused"})
            create_job(db, job, paused=bool(entry.get("paused", False)))
        except ValidationError as e:
            result["errors"].append(f"Job {name!r}: {error_text(e)}")
            continue
        except HTTPException as e:
            db.rollback()
            result["errors"].append(f"Job {name!r}: {e.detail}")
            continue
        existing.add(name)
        result["jobs_created"] += 1


def import_channels(db: Session, channels: list, result: dict):
    existing = {name for (name,) in db.query(NotificationChannel.name)}
    for entry in channels:
        if not isinstance(entry, dict) or not str(entry.get("name") or "").strip():
            result["errors"].append(f"Invalid channel entry: {entry!r}")
            continue
        name, type = str(entry["name"]).strip(), entry.get("type")
        if name in existing:
            continue
        if type not in FIELDS:
            result["errors"].append(f"Channel {name!r}: unknown type {type!r}")
            continue
        try:
            config = clean_config(type, entry.get("config") or {})
            missing = [key for key, spec in FIELDS[type].items()
                       if spec["required"] and not spec["secret"] and config[key] == ""]
            if missing:
                raise ValueError(f"missing {', '.join(missing)}")
        except ValueError as e:
            result["errors"].append(f"Channel {name!r}: {e}")
            continue
        try:
            build_apprise_url(type, config)
            complete = True
        except ValueError:
            complete = False  # Secrets are not exported: the user must enter them again.
        db.add(NotificationChannel(name=name, type=type, enabled=bool(entry.get("enabled", True)) and complete,
                                   config=config, created_at=datetime.now()))
        db.commit()
        existing.add(name)
        result["channels_created"] += 1


@router.post("/import", response_model=ImportResult)
@router.post("/import/", response_model=ImportResult)
def import_config(file: UploadFile, db: Session = Depends(get_db)):
    try:
        data = yaml.safe_load(file.file.read())
    except yaml.YAMLError as e:
        raise HTTPException(status_code=422, detail=f"Invalid YAML: {e}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Expected a homelab-backups export file")

    result = {"jobs_created": 0, "jobs_skipped": [], "channels_created": 0, "settings_applied": False, "errors": []}
    if isinstance(data.get("settings"), dict):
        try:
            update_settings(db, data["settings"])
            result["settings_applied"] = True
        except ValidationError as e:
            result["errors"].append(f"Settings: {error_text(e)}")
    import_jobs(db, data.get("jobs") or [], result)
    import_channels(db, data.get("channels") or [], result)
    return result


# Database backup

@router.get("/backup/db")
@router.get("/backup/db/")
def backup_database(background_tasks: BackgroundTasks):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    source = sqlite3.connect(engine.url.database)
    target = sqlite3.connect(path)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    background_tasks.add_task(os.remove, path)
    filename = f"homelab-backups-{datetime.now():%Y%m%d-%H%M}.db"
    return FileResponse(path, media_type="application/octet-stream", filename=filename)


# Update check

class UpdateInfo(BaseModel):
    current: str
    latest: Optional[str]
    update_available: bool
    release_url: Optional[str]
    checked_at: Optional[LocalDatetime]


_update_cache: dict = {}


def fetch_latest_release() -> tuple[Optional[str], Optional[str]]:
    request = urllib.request.Request(RELEASES_URL, headers={
        "Accept": "application/vnd.github+json", "User-Agent": "homelab-backups"})
    try:
        with urllib.request.urlopen(request, timeout=UPDATE_TIMEOUT) as response:
            release = json.load(response)
        return release["tag_name"].lstrip("v"), release.get("html_url")
    except Exception:
        return None, None


def version_tuple(version: str) -> Optional[tuple[int, ...]]:
    try:
        return tuple(int(part) for part in version.split("-")[0].split("."))
    except ValueError:
        return None


def is_newer(latest: Optional[str], current: str) -> bool:
    if not latest or current == "dev":
        return False
    latest_t, current_t = version_tuple(latest), version_tuple(current)
    return bool(latest_t and current_t and latest_t > current_t)


@router.get("/updates", response_model=UpdateInfo)
@router.get("/updates/", response_model=UpdateInfo)
def check_updates(db: Session = Depends(get_db)):
    current = os.getenv("APP_VERSION", "dev")
    if not get_settings(db).maintenance.update_check:
        return {"current": current, "latest": None, "update_available": False, "release_url": None,
                "checked_at": None}
    if not _update_cache or time.monotonic() - _update_cache["at"] > UPDATE_TTL:
        latest, url = fetch_latest_release()
        _update_cache.update(at=time.monotonic(), latest=latest, release_url=url, checked_at=datetime.now())
    latest = _update_cache["latest"]
    return {"current": current, "latest": latest, "update_available": is_newer(latest, current),
            "release_url": _update_cache["release_url"], "checked_at": _update_cache["checked_at"]}
