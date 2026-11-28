from datetime import datetime
from apscheduler.triggers.cron import CronTrigger
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator
from typing import Annotated, List, Literal, Optional
from utils.excludes import validate_patterns, validate_presets

# Naive datetimes are stored in server local time; expose them with their offset.
LocalDatetime = Annotated[datetime, AfterValidator(lambda d: d.astimezone())]

def normalize_status(value: str) -> str:
    return "success" if value == "completed" else value

Status = Annotated[str, AfterValidator(normalize_status)]

Notify = Literal["default", "always", "never"]

class BackupJobBase(BaseModel):
    name: str
    source: str
    destination: str
    schedule: str

# Validation only on input, so reading legacy rows with a bad schedule still works.
class BackupJobCreate(BackupJobBase):
    """Omitted optional fields are filled by the route: settings defaults on create, stored values on update."""
    retention_days: Optional[int] = Field(None, ge=1)
    exclude_presets: Annotated[List[str], AfterValidator(validate_presets)] = []
    exclude_patterns: Annotated[List[str], AfterValidator(validate_patterns)] = []
    notify: Notify = "default"
    ping_url: Optional[str] = None

    @field_validator("schedule")
    @classmethod
    def validate_schedule(cls, value: str) -> str:
        try:
            CronTrigger.from_crontab(value)
        except ValueError as e:
            raise ValueError(f"Invalid cron schedule (expected 5 fields): {e}")
        return value

    @field_validator("ping_url")
    @classmethod
    def validate_ping_url(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip()
        if not value:
            return None
        if not value.startswith(("http://", "https://")):
            raise ValueError("ping_url must start with http:// or https://")
        return value

class LastRun(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: Status
    started_at: Optional[LocalDatetime]
    duration_seconds: Optional[float]
    size_change_bytes: Optional[int]

class JobRead(BackupJobBase):
    id: int
    status: Status
    paused: bool
    retention_days: Optional[int]
    exclude_presets: List[str]
    exclude_patterns: List[str]
    notify: Notify
    ping_url: Optional[str]
    created_at: Optional[LocalDatetime]
    next_run: Optional[LocalDatetime]
    last_run: Optional[LastRun]
    last_success_at: Optional[LocalDatetime]
    health: Literal["healthy", "failing", "stale", "running", "paused", "new"]
    history: List[Literal["success", "failed"]]
    success_rate_30d: Optional[float]
    avg_duration_30d: Optional[float]

class ChartPoint(BaseModel):
    started_at: Optional[LocalDatetime]
    size_change_bytes: Optional[int]
    duration_seconds: Optional[float]

class JobStats(BaseModel):
    total_runs: int
    success_runs: int
    failed_runs: int
    backup_size_bytes: Optional[int]
    snapshot_count: int
    oldest_snapshot: Optional[LocalDatetime]
    chart: List[ChartPoint]

class Snapshot(BaseModel):
    at: LocalDatetime

class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    job_name: Optional[str]
    status: Status
    started_at: Optional[LocalDatetime]
    finished_at: Optional[LocalDatetime]
    duration_seconds: Optional[float]
    source_files: Optional[int]
    source_size_bytes: Optional[int]
    new_files: Optional[int]
    changed_files: Optional[int]
    deleted_files: Optional[int]
    size_change_bytes: Optional[int]
    increment_size_bytes: Optional[int]
    errors: Optional[int]

class RunDetail(RunRead):
    log: Optional[str]

class RunPage(BaseModel):
    items: List[RunRead]
    total: int

class JobCounts(BaseModel):
    total: int
    healthy: int
    failing: int
    stale: int
    running: int
    paused: int

class RunCounts(BaseModel):
    total: int
    success: int
    failed: int

class Upcoming(BaseModel):
    job_id: int
    job_name: str
    at: LocalDatetime

class Disk(BaseModel):
    path: str
    total_bytes: int
    used_bytes: int
    free_bytes: int

class CalendarDay(BaseModel):
    date: str
    status: Literal["success", "failed", "none"]

class CalendarRow(BaseModel):
    job_id: int
    job_name: str
    days: List[CalendarDay]

class Dashboard(BaseModel):
    jobs: JobCounts
    runs_30d: RunCounts
    upcoming: List[Upcoming]
    disks: List[Disk]
    calendar: List[CalendarRow]

class ServerInfo(BaseModel):
    time: LocalDatetime
    timezone: str
    version: str

class BackupResultBase(BaseModel):
    timestamp: str
    status: str
    result: str
    details: str
    job_id: int

class BackupResultRead(BackupResultBase):
    id: int

    class Config:
        from_attributes = True
