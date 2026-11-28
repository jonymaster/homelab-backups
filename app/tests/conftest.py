import os
import sys
import tempfile
from concurrent.futures import Future

import pytest

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

_db_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_db_dir, 'test.db')}"

from fastapi.testclient import TestClient  # noqa: E402

from db.migrate import run_migrations  # noqa: E402
from db.session import SessionLocal  # noqa: E402
from main import app  # noqa: E402
from models.models import (  # noqa: E402
    BackupJob, BackupResult, NotificationChannel, NotificationLog, NotificationState, Setting,
)
from utils import notifications, repository  # noqa: E402
from utils.scheduler_service import scheduler  # noqa: E402

run_migrations()


class InlineExecutor:
    """Runs submitted notification work immediately so tests are deterministic."""

    def submit(self, fn, *args):
        future = Future()
        future.set_result(fn(*args))
        return future


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    with SessionLocal() as db:
        for model in (BackupResult, BackupJob, Setting, NotificationChannel, NotificationLog, NotificationState):
            db.query(model).delete()
        db.commit()
    scheduler.remove_all_jobs()
    repository.clear()
    monkeypatch.setattr(notifications, "executor", InlineExecutor())
    yield
    scheduler.remove_all_jobs()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def job_payload(**overrides):
    payload = {
        "name": "photos",
        "source": "/app/source/photos",
        "destination": "/app/destination/photos",
        "schedule": "0 2 * * *",
    }
    payload.update(overrides)
    return payload
