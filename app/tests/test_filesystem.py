import os

import pytest

from routes import filesystem


@pytest.fixture
def roots(tmp_path, monkeypatch):
    allowed = tmp_path / "source"
    (allowed / "photos").mkdir(parents=True)
    (tmp_path / "secret").mkdir()
    monkeypatch.setattr(filesystem, "ALLOWED_ROOTS", [str(allowed)])
    return tmp_path, allowed


def test_lists_allowed_directory(client, roots):
    _, allowed = roots
    response = client.get("/list-directory", params={"path": str(allowed)})
    assert response.status_code == 200
    assert response.json() == {"directories": ["photos"]}


def test_rejects_outside_path(client, roots):
    tmp_path, _ = roots
    assert client.get("/list-directory", params={"path": str(tmp_path / "secret")}).status_code == 403
    assert client.get("/list-directory", params={"path": "/etc"}).status_code == 403


def test_rejects_dotdot_escape(client, roots):
    _, allowed = roots
    path = os.path.join(str(allowed), "..", "secret")
    assert client.get("/list-directory", params={"path": path}).status_code == 403


def test_rejects_sibling_prefix(client, roots):
    tmp_path, allowed = roots
    sibling = tmp_path / "source-evil"
    sibling.mkdir()
    assert client.get("/list-directory", params={"path": str(sibling)}).status_code == 403


def test_default_roots():
    assert filesystem.ALLOWED_ROOTS == ["/app/source", "/app/destination"]
