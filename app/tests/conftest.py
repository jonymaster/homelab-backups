import os
import sys
import tempfile

import pytest

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

_db_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_db_dir, 'test.db')}"

from fastapi.testclient import TestClient  # noqa: E402

from db.migrate import run_migrations  # noqa: E402
from db.session import SessionLocal  # noqa: E402
from main import app  # noqa: E402
from models.models import BackupJob, BackupResult  # noqa: E402
from utils import repository  # noqa: E402
from utils.scheduler_service import scheduler  # noqa: E402

run_migrations()


@pytest.fixture(autouse=True)
def clean_state():
    with SessionLocal() as db:
        db.query(BackupResult).delete()
        db.query(BackupJob).delete()
        db.commit()
    scheduler.remove_all_jobs()
    repository.clear()
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
