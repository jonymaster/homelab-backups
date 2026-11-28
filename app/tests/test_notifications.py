import subprocess
from datetime import datetime, timedelta
from unittest.mock import patch

import apprise
import pytest

from models.models import BackupJob, BackupResult, NotificationChannel, NotificationLog
from utils import notifications
from utils.backup_utils import execute_backup
from utils.notifications import MASK, build_apprise_url, send

NTFY = {"server_url": "https://ntfy.sh", "topic": "backups", "token": "tk_secret"}


# Apprise URL builder

@pytest.mark.parametrize("type, config, url, attrs", [
    ("ntfy", NTFY, "ntfys://ntfy.sh/backups?auth=token&token=tk_secret",
     {"host": "ntfy.sh", "secure": True, "token": "tk_secret", "topics": ["backups"]}),
    ("ntfy", {"server_url": "http://ntfy.lan:8080/", "topic": "b"}, "ntfy://ntfy.lan:8080/b",
     {"host": "ntfy.lan", "port": 8080, "secure": False, "topics": ["b"]}),
    ("gotify", {"server_url": "https://gotify.example.com/sub", "token": "Atok"},
     "gotifys://gotify.example.com/sub/Atok", {"host": "gotify.example.com", "secure": True, "token": "Atok"}),
    ("telegram", {"bot_token": "123456:ABC-DEF_ghi", "chat_id": "-100123"}, "tgram://123456:ABC-DEF_ghi/-100123",
     {"bot_token": "123456:ABC-DEF_ghi"}),
    ("discord", {"webhook_url": "https://discord.com/api/webhooks/1234/abc-DEF_x"}, "discord://1234/abc-DEF_x",
     {"webhook_id": "1234", "webhook_token": "abc-DEF_x"}),
    ("slack", {"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"}, "slack://T000/B000/XXXX",
     {"token_a": "T000", "token_b": "B000", "token_c": "XXXX"}),
    ("pushover", {"user_key": "ukey", "app_token": "atok"}, "pover://ukey@atok", {"user_key": "ukey", "token": "atok"}),
    ("email", {"smtp_host": "smtp.gmail.com", "smtp_port": 587, "security": "starttls", "username": "me@gmail.com",
               "password": "p@ss:w/rd", "from_address": "me@gmail.com", "to_address": "you@x.com"},
     "mailtos://me%40gmail.com:p%40ss%3Aw%2Frd@smtp.gmail.com:587/"
     "?smtp=smtp.gmail.com&from=me%40gmail.com&to=you%40x.com&mode=starttls",
     {"smtp_host": "smtp.gmail.com", "port": 587, "secure_mode": "starttls", "user": "me@gmail.com",
      "password": "p@ss:w/rd", "targets": [(False, "you@x.com")]}),
    ("email", {"smtp_host": "mail.lan", "smtp_port": 465, "security": "ssl", "from_address": "a@lan.io",
               "to_address": "b@lan.io"},
     "mailtos://mail.lan:465/?smtp=mail.lan&from=a%40lan.io&to=b%40lan.io&mode=ssl",
     {"port": 465, "secure_mode": "ssl"}),
    ("email", {"smtp_host": "mail.lan", "smtp_port": 25, "security": "none", "from_address": "a@lan.io",
               "to_address": "b@lan.io"},
     "mailto://mail.lan:25/?smtp=mail.lan&from=a%40lan.io&to=b%40lan.io&mode=insecure",
     {"port": 25, "secure_mode": "insecure"}),
    ("apprise", {"url": " json://localhost:8000/hook "}, "json://localhost:8000/hook", {"host": "localhost"}),
])
def test_build_apprise_url(type, config, url, attrs):
    assert build_apprise_url(type, config) == url
    plugin = apprise.Apprise.instantiate(url)
    assert plugin is not None
    for key, value in attrs.items():
        assert getattr(plugin, key) == value, key


@pytest.mark.parametrize("type, config", [
    ("nope", {}),
    ("ntfy", {"server_url": "https://ntfy.sh"}),
    ("ntfy", {"server_url": "ntfy.sh", "topic": "x"}),
    ("discord", {"webhook_url": "https://example.com/hook"}),
    ("slack", {"webhook_url": "https://hooks.slack.com/x"}),
    ("email", {"smtp_host": "h", "smtp_port": 25, "security": "tls", "from_address": "a@b", "to_address": "c@d"}),
])
def test_build_apprise_url_errors(type, config):
    with pytest.raises(ValueError):
        build_apprise_url(type, config)


def test_send_reports_errors():
    with patch("utils.notifications.apprise.Apprise") as Apprise:
        Apprise.return_value.add.return_value = True
        Apprise.return_value.notify.return_value = True
        assert send("json://x", "t", "b") is None
        Apprise.return_value.notify.return_value = False
        assert send("json://x", "t", "b") == "Sending failed"
        Apprise.return_value.add.return_value = False
        assert send("json://x", "t", "b") == "Invalid notification URL"
        Apprise.return_value.add.side_effect = RuntimeError("boom")
        assert send("json://x", "t", "b") == "boom"


# Channels API

def create_channel(client, **overrides):
    body = {"name": "Phone", "type": "ntfy", "config": NTFY, **overrides}
    response = client.post("/notifications/channels", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_channel_types(client):
    types = client.get("/notifications/channel-types").json()
    assert [t["type"] for t in types] == ["ntfy", "gotify", "telegram", "discord", "slack", "pushover", "email",
                                          "apprise"]
    ntfy = types[0]["fields"]
    assert ntfy[0]["key"] == "server_url" and ntfy[0]["default"] == "https://ntfy.sh"
    assert ntfy[2] == {"key": "token", "label": "Access token", "secret": True, "required": False, "type": "text",
                       "placeholder": ""}
    security = next(f for f in types[6]["fields"] if f["key"] == "security")
    assert security["type"] == "select" and security["options"] == ["starttls", "ssl", "none"]


def test_channel_crud_and_masking(client, db):
    channel = create_channel(client)
    assert channel["config"] == {"server_url": "https://ntfy.sh", "topic": "backups", "token": MASK}
    assert channel["enabled"] is True
    assert datetime.fromisoformat(channel["created_at"]).tzinfo is not None
    assert client.get("/notifications/channels").json() == [channel]

    # Masked secret keeps the stored value; other fields update.
    response = client.put(f"/notifications/channels/{channel['id']}",
                          json={"name": "Phone 2", "enabled": False, "config": {"topic": "other", "token": MASK}})
    assert response.status_code == 200, response.text
    assert response.json()["config"] == {"server_url": "https://ntfy.sh", "topic": "other", "token": MASK}
    stored = db.get(NotificationChannel, channel["id"])
    assert stored.config["token"] == "tk_secret"
    assert (stored.name, stored.enabled) == ("Phone 2", False)

    # Clearing an optional secret returns an empty string.
    cleared = client.put(f"/notifications/channels/{channel['id']}/", json={"config": {"token": ""}}).json()
    assert cleared["config"]["token"] == ""

    assert client.delete(f"/notifications/channels/{channel['id']}").status_code == 200
    assert client.get("/notifications/channels").json() == []
    assert client.delete(f"/notifications/channels/{channel['id']}").status_code == 404


def test_channel_defaults_applied(client):
    channel = create_channel(client, config={"topic": "t"})
    assert channel["config"]["server_url"] == "https://ntfy.sh"
    email = create_channel(client, name="Mail", type="email", config={
        "smtp_host": "mail.lan", "from_address": "a@lan.io", "to_address": "b@lan.io"})
    assert email["config"]["smtp_port"] == 587
    assert email["config"]["security"] == "starttls"
    assert email["config"]["password"] == ""


@pytest.mark.parametrize("body", [
    {"name": "x", "type": "nope", "config": {}},
    {"name": "x", "type": "ntfy", "config": {"server_url": "https://ntfy.sh"}},
    {"name": "x", "type": "telegram", "config": {"chat_id": "1"}},
    {"name": " ", "type": "ntfy", "config": NTFY},
    {"name": "x", "type": "email", "config": {"smtp_host": "h", "smtp_port": "abc", "from_address": "a",
                                              "to_address": "b"}},
    {"name": "x", "type": "email", "config": {"smtp_host": "h", "security": "tls", "from_address": "a",
                                              "to_address": "b"}},
])
def test_channel_validation(client, body):
    assert client.post("/notifications/channels", json=body).status_code == 422


def test_test_endpoints_and_log(client, db):
    channel = create_channel(client)
    with patch("utils.notifications.send", return_value=None) as sent:
        assert client.post(f"/notifications/channels/{channel['id']}/test").json() == {"ok": True, "error": None}
    assert sent.call_args.args[0] == "ntfys://ntfy.sh/backups?auth=token&token=tk_secret"

    with patch("utils.notifications.send", return_value="401 Unauthorized"):
        result = client.post("/notifications/test", json={"type": "gotify",
                                                          "config": {"server_url": "https://g", "token": "x"}}).json()
    assert result == {"ok": False, "error": "401 Unauthorized"}
    assert client.post("/notifications/test", json={"type": "gotify", "config": {}}).json()["ok"] is False

    log = client.get("/notifications/log").json()
    assert [(e["event"], e["ok"]) for e in log] == [("test", False), ("test", False), ("test", True)]
    assert log[1]["error"] == "gotify: 401 Unauthorized"
    assert set(log[0]) == {"id", "at", "event", "job_id", "job_name", "title", "ok", "error"}
    assert len(client.get("/notifications/log?limit=1").json()) == 1
    assert client.post("/notifications/channels/999/test").status_code == 404


# Run events

def make_job(db, notify="default", **values):
    job = BackupJob(name="Photos", source="/src", destination="/dst", schedule="0 2 * * *", notify=notify, **values)
    db.add(job)
    db.commit()
    return job.id


def add_channel(db, **values):
    db.add(NotificationChannel(name="Hook", type="apprise", enabled=True, config={"url": "json://localhost/x"},
                               **values))
    db.commit()


def run_backup(job_id, ok=True, output="ok"):
    effect = None if ok else subprocess.CalledProcessError(1, "rdiff-backup", output=output)
    with patch("utils.backup_utils.subprocess.run", side_effect=effect) as run:
        run.return_value.stdout = output
        execute_backup(job_id)


def sent_titles(sent):
    return [c.args[1] for c in sent.call_args_list]


@pytest.fixture
def sent():
    with patch("utils.notifications.send", return_value=None) as mock:
        yield mock


def test_default_mode_follows_global_toggles(db, sent, client):
    add_channel(db)
    job_id = make_job(db)
    run_backup(job_id)                      # run_succeeded: off by default
    run_backup(job_id, ok=False)            # run_failed
    run_backup(job_id, ok=False)            # run_failed again
    run_backup(job_id)                      # run_recovered
    run_backup(job_id)                      # run_succeeded: off
    assert sent_titles(sent) == ["Photos: backup failed", "Photos: backup failed", "Photos: backup recovered"]

    client.put("/settings", json={"notifications": {"events": {"run_succeeded": True, "run_failed": False}}})
    sent.reset_mock()
    run_backup(job_id)
    run_backup(job_id, ok=False)
    assert sent_titles(sent) == ["Photos: backup succeeded"]

    log = client.get("/notifications/log").json()
    assert log[0]["event"] == "run_succeeded" and log[0]["job_name"] == "Photos" and log[0]["job_id"] == job_id


def test_always_and_never(db, sent):
    add_channel(db)
    always = make_job(db, notify="always")
    run_backup(always)
    assert sent_titles(sent) == ["Photos: backup succeeded"]

    sent.reset_mock()
    db.query(BackupJob).update({"notify": "never"})
    db.commit()
    run_backup(always, ok=False)
    assert sent.call_count == 0


def test_no_channels_no_log(db, sent):
    job_id = make_job(db)
    run_backup(job_id, ok=False)
    assert sent.call_count == 0
    assert db.query(NotificationLog).count() == 0


def test_disabled_channel_skipped(db, sent):
    add_channel(db)
    db.add(NotificationChannel(name="Off", type="apprise", enabled=False, config={"url": "json://off/x"}))
    db.commit()
    run_backup(make_job(db), ok=False)
    assert [c.args[0] for c in sent.call_args_list] == ["json://localhost/x"]


def test_failure_message(db, sent, client):
    client.put("/settings", json={"general": {"base_url": "http://nas:3000"}})
    add_channel(db)
    job_id = make_job(db)
    run_backup(job_id, ok=False, output="NOTE: starting\nERROR:   Source path /src does not exist\nmore\n")
    title, body = sent.call_args.args[1:]
    run_id = db.query(BackupResult).one().id
    assert title == "Photos: backup failed"
    assert "ERROR:   Source path /src does not exist" in body
    assert "Duration:" in body
    assert body.endswith(f"http://nas:3000/activity?run={run_id}")


def test_send_failure_is_logged_and_backup_unaffected(db, client):
    add_channel(db)
    db.add(NotificationChannel(name="Bad", type="discord", enabled=True, config={"webhook_url": "nope"}))
    db.commit()
    job_id = make_job(db)
    with patch("utils.notifications.send", return_value="connection refused"):
        run_backup(job_id, ok=False)
    assert db.get(BackupJob, job_id).status == "failed"
    entry = client.get("/notifications/log").json()[0]
    assert entry["ok"] is False
    assert entry["error"] == "Hook: connection refused; Bad: Invalid Discord webhook URL"


def test_dispatch_exception_never_breaks_backup(db):
    job_id = make_job(db)
    with patch("utils.notifications.notify_run", side_effect=RuntimeError("db gone")):
        run_backup(job_id)
    assert db.get(BackupJob, job_id).status == "success"


def test_success_resets_stale_flag(db, sent):
    job_id = make_job(db, stale_notified_at=datetime.now() - timedelta(hours=1))
    run_backup(job_id, ok=False)
    db.expire_all()
    assert db.get(BackupJob, job_id).stale_notified_at is not None
    run_backup(job_id)
    db.expire_all()
    assert db.get(BackupJob, job_id).stale_notified_at is None


def test_dispatch_runs_on_executor():
    calls = []
    future = notifications.submit(calls.append, 1)
    assert future.result() is None and calls == [1]
