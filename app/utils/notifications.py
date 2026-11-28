"""Notification channels (sent through Apprise) and event dispatch."""
import logging
import re
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from typing import Optional
from urllib.parse import quote, urlencode, urlsplit

import apprise

from db.session import SessionLocal
from models.models import BackupJob, BackupResult, NotificationChannel, NotificationLog
from utils.settings import get_settings

logger = logging.getLogger(__name__)

MASK = "********"
EVENTS = ["run_failed", "run_recovered", "run_succeeded", "job_stale", "disk_low", "weekly_summary", "test"]


def field(key, label, secret=False, required=True, default=None, type="text", options=None, placeholder=""):
    spec = {"key": key, "label": label, "secret": secret, "required": required, "type": type,
            "placeholder": placeholder}
    if default is not None:
        spec["default"] = default
    if options is not None:
        spec["options"] = options
    return spec


CHANNEL_TYPES = [
    {"type": "ntfy", "label": "ntfy", "fields": [
        field("server_url", "Server", default="https://ntfy.sh"),
        field("topic", "Topic"),
        field("token", "Access token", secret=True, required=False),
    ]},
    {"type": "gotify", "label": "Gotify", "fields": [
        field("server_url", "Server", placeholder="https://gotify.example.com"),
        field("token", "App token", secret=True),
    ]},
    {"type": "telegram", "label": "Telegram", "fields": [
        field("bot_token", "Bot token", secret=True, placeholder="123456:ABC-DEF..."),
        field("chat_id", "Chat ID"),
    ]},
    {"type": "discord", "label": "Discord", "fields": [
        field("webhook_url", "Webhook URL", secret=True, placeholder="https://discord.com/api/webhooks/..."),
    ]},
    {"type": "slack", "label": "Slack", "fields": [
        field("webhook_url", "Webhook URL", secret=True, placeholder="https://hooks.slack.com/services/..."),
    ]},
    {"type": "pushover", "label": "Pushover", "fields": [
        field("user_key", "User key", secret=True),
        field("app_token", "App token", secret=True),
    ]},
    {"type": "email", "label": "Email", "fields": [
        field("smtp_host", "SMTP server", placeholder="smtp.example.com"),
        field("smtp_port", "Port", default=587, type="number"),
        field("security", "Security", default="starttls", type="select", options=["starttls", "ssl", "none"]),
        field("username", "Username", required=False),
        field("password", "Password", secret=True, required=False),
        field("from_address", "From"),
        field("to_address", "To"),
    ]},
    {"type": "apprise", "label": "Apprise URL", "fields": [
        field("url", "Apprise URL", secret=True, placeholder="scheme://..."),
    ]},
]
FIELDS = {t["type"]: {f["key"]: f for f in t["fields"]} for t in CHANNEL_TYPES}

DISCORD_WEBHOOK = re.compile(r"^https://(?:\w+\.)?discord(?:app)?\.com/api/webhooks/(\d+)/([\w-]+)/?$")
SLACK_WEBHOOK = re.compile(r"^https://hooks\.slack\.com/services/(\w+)/(\w+)/(\w+)/?$")


def q(value) -> str:
    return quote(str(value), safe="")


def server_parts(url: str, secure_scheme: str, plain_scheme: str) -> tuple[str, str]:
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(f"Invalid server URL: {url}")
    scheme = secure_scheme if parts.scheme == "https" else plain_scheme
    return scheme, parts.netloc + parts.path.rstrip("/")


def build_apprise_url(type: str, config: dict) -> str:
    """Apprise URL for a channel. Raises ValueError on missing or malformed values."""
    if type not in FIELDS:
        raise ValueError(f"Unknown channel type: {type}")
    for key, spec in FIELDS[type].items():
        if spec["required"] and config.get(key) in (None, ""):
            raise ValueError(f"Missing required field: {key}")
    c = config

    if type == "ntfy":
        scheme, host = server_parts(c["server_url"], "ntfys", "ntfy")
        url = f"{scheme}://{host}/{q(c['topic'])}"
        return url + (f"?{urlencode({'auth': 'token', 'token': c['token']})}" if c.get("token") else "")
    if type == "gotify":
        scheme, host = server_parts(c["server_url"], "gotifys", "gotify")
        return f"{scheme}://{host}/{q(c['token'])}"
    if type == "telegram":
        return f"tgram://{c['bot_token']}/{q(c['chat_id'])}"
    if type == "discord":
        match = DISCORD_WEBHOOK.match(c["webhook_url"].strip())
        if not match:
            raise ValueError("Invalid Discord webhook URL")
        return "discord://{}/{}".format(*match.groups())
    if type == "slack":
        match = SLACK_WEBHOOK.match(c["webhook_url"].strip())
        if not match:
            raise ValueError("Invalid Slack webhook URL")
        return "slack://{}/{}/{}".format(*match.groups())
    if type == "pushover":
        return f"pover://{q(c['user_key'])}@{q(c['app_token'])}"
    if type == "email":
        security = c.get("security") or "starttls"
        if security not in ("starttls", "ssl", "none"):
            raise ValueError(f"Invalid security: {security}")
        auth = ""
        if c.get("username"):
            auth = q(c["username"]) + (f":{q(c['password'])}" if c.get("password") else "") + "@"
        scheme = "mailto" if security == "none" else "mailtos"
        params = {"smtp": c["smtp_host"], "from": c["from_address"], "to": c["to_address"],
                  "mode": "insecure" if security == "none" else security}
        return f"{scheme}://{auth}{c['smtp_host']}:{int(c['smtp_port'])}/?{urlencode(params)}"
    return c["url"].strip()


def clean_config(type: str, config: dict, stored: Optional[dict] = None) -> dict:
    """Known fields only, defaults applied; a masked secret keeps the stored value."""
    if type not in FIELDS:
        raise ValueError(f"Unknown channel type: {type}")
    cleaned = {}
    for key, spec in FIELDS[type].items():
        value = config.get(key, spec.get("default", ""))
        if spec["secret"] and value == MASK:
            value = (stored or {}).get(key, "")
        if spec["type"] == "number" and value not in (None, ""):
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"{key} must be a number")
        elif isinstance(value, str):
            value = value.strip()
        if spec["type"] == "select" and value not in spec["options"]:
            raise ValueError(f"{key} must be one of: {', '.join(spec['options'])}")
        cleaned[key] = "" if value is None else value
    return cleaned


def mask_config(type: str, config: dict) -> dict:
    fields = FIELDS.get(type, {})
    return {key: (MASK if value else "") if fields.get(key, {}).get("secret") else value
            for key, value in config.items()}


def without_secrets(type: str, config: dict) -> dict:
    fields = FIELDS.get(type, {})
    return {key: value for key, value in config.items() if not fields.get(key, {}).get("secret")}


def send(url: str, title: str, body: str) -> Optional[str]:
    """Send one notification. Returns None on success, otherwise the error."""
    try:
        with apprise.LogCapture(level=logging.WARNING) as output:
            notifier = apprise.Apprise()
            if not notifier.add(url):
                return "Invalid notification URL"
            if notifier.notify(title=title, body=body):
                return None
            lines = output.getvalue().strip().splitlines()
            return lines[-1] if lines else "Sending failed"
    except Exception as e:
        return str(e) or type(e).__name__


def deliver(db, event: str, title: str, body: str, job: Optional[BackupJob] = None) -> Optional[NotificationLog]:
    """Send to every enabled channel and record one log entry. Never raises on send errors."""
    channels = db.query(NotificationChannel).filter(NotificationChannel.enabled.is_(True)).all()
    if not channels:
        return None
    errors = []
    for channel in channels:
        try:
            error = send(build_apprise_url(channel.type, channel.config), title, body)
        except ValueError as e:
            error = str(e)
        if error:
            errors.append(f"{channel.name}: {error}")
    entry = NotificationLog(at=datetime.now(), event=event, job_id=job and job.id, job_name=job and job.name,
                            title=title, ok=not errors, error="; ".join(errors) or None)
    db.add(entry)
    db.commit()
    return entry


def log_test(db, channel_name: str, error: Optional[str]):
    db.add(NotificationLog(at=datetime.now(), event="test", title=f"Test notification ({channel_name})",
                           ok=error is None, error=error and f"{channel_name}: {error}"))
    db.commit()


TEST_TITLE = "Homelab Backups: test notification"
TEST_BODY = "If you can read this, notifications are working."


def test_channel(db, name: str, type: str, config: dict) -> Optional[str]:
    try:
        error = send(build_apprise_url(type, config), TEST_TITLE, TEST_BODY)
    except ValueError as e:
        error = str(e)
    log_test(db, name, error)
    return error


# Event dispatch. Sending happens on a worker thread so it never delays or fails a backup.

executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="notify")


def submit(fn, *args) -> Optional[Future]:
    def run():
        try:
            fn(*args)
        except Exception:
            logger.exception("Notification failed")
    try:
        return executor.submit(run)
    except RuntimeError:
        logger.exception("Notification executor unavailable")
        return None


def wants(job: Optional[BackupJob], event: str, settings) -> bool:
    if job is not None and job.notify == "never":
        return False
    if job is not None and job.notify == "always":
        return True
    return getattr(settings.notifications.events, event)


def human_bytes(value: Optional[float]) -> str:
    if value is None:
        return "unknown"
    sign = "-" if value < 0 else ""
    value = abs(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{sign}{value:.0f} {unit}" if unit == "B" else f"{sign}{value:.1f} {unit}"
        value /= 1024


def human_duration(seconds: Optional[float]) -> str:
    if seconds is None:
        return "unknown"
    seconds = int(round(seconds))
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m {secs}s" if minutes else f"{secs}s"


def error_lines(log: Optional[str], limit: int = 3) -> list[str]:
    lines = [line.strip() for line in (log or "").splitlines() if line.strip()]
    errors = [line for line in lines if "ERROR" in line or "Error" in line]
    return (errors or lines)[-limit:]


def run_event(db, run: BackupResult) -> str:
    if run.status == "failed":
        return "run_failed"
    previous = (
        db.query(BackupResult.status)
        .filter(BackupResult.job_id == run.job_id, BackupResult.id < run.id,
                BackupResult.status.in_(("success", "failed")))
        .order_by(BackupResult.id.desc())
        .first()
    )
    return "run_recovered" if previous and previous.status == "failed" else "run_succeeded"


def run_message(event: str, job: BackupJob, run: BackupResult, base_url: Optional[str]) -> tuple[str, str]:
    title = {"run_failed": f"{job.name}: backup failed", "run_recovered": f"{job.name}: backup recovered",
             "run_succeeded": f"{job.name}: backup succeeded"}[event]
    lines = []
    if event == "run_failed":
        lines += error_lines(run.log)
    lines.append(f"Duration: {human_duration(run.duration_seconds)}")
    if event != "run_failed" and run.size_change_bytes is not None:
        lines.append(f"Data changed: {human_bytes(run.size_change_bytes)}")
    if base_url:
        lines.append(f"{base_url}/activity?run={run.id}")
    return title, "\n".join(lines)


def notify_run(run_id: int):
    with SessionLocal() as db:
        run = db.get(BackupResult, run_id)
        job = run and db.get(BackupJob, run.job_id)
        if job is None:
            return
        event = run_event(db, run)
        if run.status == "success" and job.stale_notified_at is not None:
            job.stale_notified_at = None
            db.commit()
        settings = get_settings(db)
        if wants(job, event, settings):
            title, body = run_message(event, job, run, settings.general.base_url)
            deliver(db, event, title, body, job)


def dispatch_run(run_id: int) -> Optional[Future]:
    return submit(notify_run, run_id)
