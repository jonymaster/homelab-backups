from unittest.mock import patch

from conftest import job_payload
from models.models import BackupJob, BackupResult
from utils.scheduler_service import scheduler


def create_job(client, **overrides):
    response = client.post("/jobs", json=job_payload(**overrides))
    assert response.status_code == 200, response.text
    return response.json()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_delete_job_without_results(client):
    job = create_job(client)
    assert client.delete(f"/jobs/{job['id']}").status_code == 200
    assert client.get(f"/jobs/{job['id']}").status_code == 404


def test_delete_job_removes_results(client, db):
    job = create_job(client)
    db.add(BackupResult(job_id=job["id"], timestamp="t", status="success", result="ok", details=""))
    db.commit()
    assert client.delete(f"/jobs/{job['id']}").status_code == 200
    assert db.query(BackupResult).count() == 0


def test_delete_job_missing_from_scheduler(client):
    job = create_job(client)
    scheduler.remove_all_jobs()
    assert client.delete(f"/jobs/{job['id']}").status_code == 200


def test_update_job_missing_from_scheduler(client):
    job = create_job(client)
    scheduler.remove_all_jobs()
    response = client.put(f"/jobs/{job['id']}", json=job_payload(schedule="30 4 * * 1"))
    assert response.status_code == 200
    assert scheduler.get_job(f"backup-{job['id']}") is not None


def test_cron_uses_all_fields(client):
    job = create_job(client, schedule="15 3 1 6 2")
    trigger = scheduler.get_job(f"backup-{job['id']}").trigger
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields["minute"] == "15"
    assert fields["hour"] == "3"
    assert fields["day"] == "1"
    assert fields["month"] == "6"
    assert fields["day_of_week"] == "2"


def test_invalid_schedule_rejected(client, db):
    for schedule in ["0 2", "* * * * * *", "99 2 * * *", "not a cron at all"]:
        response = client.post("/jobs", json=job_payload(schedule=schedule))
        assert response.status_code == 422, schedule
    assert db.query(BackupJob).count() == 0


def test_invalid_schedule_rejected_on_update(client):
    job = create_job(client)
    response = client.put(f"/jobs/{job['id']}", json=job_payload(schedule="0 2"))
    assert response.status_code == 422


def test_duplicate_name_conflict(client):
    create_job(client)
    response = client.post("/jobs", json=job_payload(destination="/app/destination/other"))
    assert response.status_code == 409


def test_duplicate_destination_conflict(client):
    create_job(client)
    response = client.post("/jobs", json=job_payload(name="other", destination="/app/destination/photos/"))
    assert response.status_code == 409
    assert "photos" in response.json()["detail"]


def test_update_conflicts_with_other_job(client):
    create_job(client)
    other = create_job(client, name="docs", destination="/app/destination/docs")
    response = client.put(f"/jobs/{other['id']}", json=job_payload(name="docs"))
    assert response.status_code == 409


def test_update_keeps_own_name_and_destination(client):
    job = create_job(client)
    response = client.put(f"/jobs/{job['id']}", json=job_payload(source="/app/source/new"))
    assert response.status_code == 200
    assert response.json()["source"] == "/app/source/new"


def test_results_empty_list(client):
    job = create_job(client)
    for path in (f"/jobs/{job['id']}/results", f"/jobs/{job['id']}/results/"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == []


def test_execute_rejects_running_job(client, db):
    job = create_job(client)
    db.query(BackupJob).filter_by(id=job["id"]).update({"status": "running"})
    db.commit()
    with patch("utils.backup_utils.subprocess.run") as run:
        response = client.post(f"/jobs/{job['id']}/execute")
    assert response.status_code == 409
    run.assert_not_called()


def test_execute_marks_running_before_background_task(client):
    job = create_job(client)
    with patch("routes.backup_job.execute_backup") as execute:
        response = client.post(f"/jobs/{job['id']}/execute")
    assert response.status_code == 200
    execute.assert_called_once_with(job["id"])
    assert client.get(f"/jobs/{job['id']}").json()["status"] == "running"


def test_execute_success_sets_success_status(client):
    job = create_job(client)
    with patch("utils.backup_utils.subprocess.run") as run:
        run.return_value.stdout = "done"
        response = client.post(f"/jobs/{job['id']}/execute")
    assert response.status_code == 200
    assert client.get(f"/jobs/{job['id']}").json()["status"] == "success"
    results = client.get(f"/jobs/{job['id']}/results").json()
    assert [r["status"] for r in results] == ["success"]
