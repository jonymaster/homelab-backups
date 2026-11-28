from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy.orm import Session

from models.models import Setting
from utils.excludes import validate_patterns, validate_presets

Time = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class Section(BaseModel):
    model_config = ConfigDict(extra="forbid")


class General(Section):
    clock: Literal["24h", "12h"] = "24h"
    default_theme: Literal["dark", "light", "system"] = "dark"
    base_url: Optional[str] = None

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip().rstrip("/")
        if not value:
            return None
        if not value.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return value


class Events(Section):
    run_failed: bool = True
    run_recovered: bool = True
    job_stale: bool = True
    disk_low: bool = True
    run_succeeded: bool = False
    weekly_summary: bool = False


class Notifications(Section):
    events: Events = Events()
    weekly_summary_day: int = Field(0, ge=0, le=6)
    weekly_summary_time: Time = "09:00"


class Monitoring(Section):
    disk_warning_percent: int = Field(90, ge=50, le=99)
    metrics_enabled: bool = False


class Defaults(Section):
    retention_days: Optional[int] = Field(180, ge=1)
    exclude_presets: Annotated[list[str], AfterValidator(validate_presets)] = ["caches", "temp", "trash"]
    exclude_patterns: Annotated[list[str], AfterValidator(validate_patterns)] = []
    schedule_time: Time = "02:00"


class Maintenance(Section):
    update_check: bool = True


class Settings(Section):
    general: General = General()
    notifications: Notifications = Notifications()
    monitoring: Monitoring = Monitoring()
    defaults: Defaults = Defaults()
    maintenance: Maintenance = Maintenance()


def deep_merge(base: dict, patch: dict) -> dict:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


def known_only(base: dict, stored: dict) -> dict:
    """Stored values for keys that still exist, so a removed setting does not break reads."""
    return {
        key: known_only(base[key], value) if isinstance(base[key], dict) and isinstance(value, dict) else value
        for key, value in stored.items() if key in base
    }


def get_settings(db: Session) -> Settings:
    defaults = Settings().model_dump()
    stored = {row.key: row.value for row in db.query(Setting).all()}
    return Settings.model_validate(deep_merge(defaults, known_only(defaults, stored)))


def update_settings(db: Session, patch: dict) -> Settings:
    """Deep-merge `patch` into the stored settings. Raises pydantic.ValidationError."""
    settings = Settings.model_validate(deep_merge(get_settings(db).model_dump(), patch))
    for key, value in settings.model_dump().items():
        db.merge(Setting(key=key, value=value))
    db.commit()
    return settings
