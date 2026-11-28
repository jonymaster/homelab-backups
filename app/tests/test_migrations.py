from datetime import datetime

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from db.migrate import ALEMBIC_INI, run_migrations
from db.session import Base

# DDL emitted by Base.metadata.create_all before migrations existed.
OLD_SCHEMA = [
    "CREATE TABLE backup_jobs (id INTEGER NOT NULL, name VARCHAR, source VARCHAR, destination VARCHAR, "
    "schedule VARCHAR, status VARCHAR, PRIMARY KEY (id))",
    "CREATE INDEX ix_backup_jobs_id ON backup_jobs (id)",
    "CREATE UNIQUE INDEX ix_backup_jobs_name ON backup_jobs (name)",
    "CREATE INDEX ix_backup_jobs_source ON backup_jobs (source)",
    "CREATE INDEX ix_backup_jobs_destination ON backup_jobs (destination)",
    "CREATE INDEX ix_backup_jobs_schedule ON backup_jobs (schedule)",
    "CREATE TABLE backup_results (id INTEGER NOT NULL, job_id INTEGER, timestamp VARCHAR, status VARCHAR, "
    "result VARCHAR, details VARCHAR, PRIMARY KEY (id), FOREIGN KEY(job_id) REFERENCES backup_jobs (id))",
    "CREATE INDEX ix_backup_results_id ON backup_results (id)",
    "CREATE INDEX ix_backup_results_timestamp ON backup_results (timestamp)",
    "CREATE INDEX ix_backup_results_status ON backup_results (status)",
    "CREATE INDEX ix_backup_results_result ON backup_results (result)",
    "CREATE INDEX ix_backup_results_details ON backup_results (details)",
]


def make_engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path / 'app.db'}")


def test_adopts_existing_database(tmp_path):
    engine = make_engine(tmp_path)
    with engine.begin() as conn:
        for statement in OLD_SCHEMA:
            conn.execute(text(statement))
        conn.execute(text("INSERT INTO backup_jobs VALUES (1, 'photos', '/s', '/d', '0 2 * * *', 'completed')"))
        conn.execute(text("INSERT INTO backup_jobs VALUES (2, 'docs', '/s2', '/d2', '0 3 * * *', 'pending')"))
        conn.execute(text(
            "INSERT INTO backup_results VALUES "
            "(1, 1, '2026-01-02T02:00:05.123456', 'completed', 'Backup successful', 'old output'), "
            "(2, 1, '2026-01-03T02:00:07', 'failed', 'Backup failed', 'boom'), "
            "(3, 1, 'garbage', 'success', 'Backup successful', '')"
        ))

    run_migrations(engine)
    run_migrations(engine)

    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0003"
        runs = conn.execute(text(
            "SELECT id, status, started_at, finished_at, log, details FROM backup_results ORDER BY id")).all()
        jobs = conn.execute(text("SELECT id, name, status, paused, created_at FROM backup_jobs ORDER BY id")).all()

    assert [(r.id, r.status) for r in runs] == [(1, "success"), (2, "failed"), (3, "success")]
    assert runs[0].started_at == "2026-01-02 02:00:05.123456"
    assert runs[0].finished_at == runs[0].started_at
    assert runs[2].started_at is None
    assert [r.log for r in runs] == ["old output", "boom", ""]
    assert [r.details for r in runs] == ["old output", "boom", ""]

    assert [(j.name, j.status, j.paused) for j in jobs] == [("photos", "success", 0), ("docs", "pending", 0)]
    assert jobs[0].created_at == "2026-01-02 02:00:05.123456"
    assert datetime.fromisoformat(jobs[1].created_at).date() == datetime.now().date()


def test_0003_on_populated_database(tmp_path):
    engine = make_engine(tmp_path)
    with engine.begin() as conn:
        for statement in OLD_SCHEMA:
            conn.execute(text(statement))
        conn.execute(text("INSERT INTO backup_jobs VALUES (1, 'photos', '/s', '/d', '0 2 * * *', 'completed')"))
        conn.execute(text(
            "INSERT INTO backup_results VALUES (1, 1, '2026-01-02T02:00:05', 'completed', 'ok', 'out')"))

    config = Config(ALEMBIC_INI)
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.stamp(config, "0001")
        command.upgrade(config, "0002")
        conn.execute(text("INSERT INTO backup_jobs (id, name, source, destination, schedule, status, paused) "
                          "VALUES (2, 'docs', '/s2', '/d2', '0 3 * * *', 'success', 1)"))

    run_migrations(engine)
    run_migrations(engine)

    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0003"
        jobs = conn.execute(text(
            "SELECT name, paused, retention_days, exclude_presets, exclude_patterns, notify, ping_url, "
            "stale_notified_at FROM backup_jobs ORDER BY id")).all()
        runs = conn.execute(text("SELECT status, log FROM backup_results")).all()
        tables = set(inspect(conn).get_table_names())

    assert [tuple(j) for j in jobs] == [
        ("photos", 0, None, "[]", "[]", "default", None, None),
        ("docs", 1, None, "[]", "[]", "default", None, None),
    ]
    assert [tuple(r) for r in runs] == [("success", "out")]
    assert {"settings", "notification_channels", "notification_log", "notification_state"} <= tables


def test_fresh_database_matches_models(tmp_path):
    engine = make_engine(tmp_path)
    run_migrations(engine)
    run_migrations(engine)
    with engine.connect() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
        assert "alembic_version" in inspect(conn).get_table_names()
