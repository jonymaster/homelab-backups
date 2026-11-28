"""Add run timing, statistics and log; job paused flag and created_at.

Revision ID: 0002
Revises: 0001
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

RUN_INT_COLUMNS = [
    "source_files", "source_size_bytes", "new_files", "changed_files", "deleted_files",
    "size_change_bytes", "increment_size_bytes", "errors",
]


def parse_iso(value):
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def upgrade():
    with op.batch_alter_table("backup_jobs") as batch:
        batch.add_column(sa.Column("paused", sa.Boolean(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("created_at", sa.DateTime()))

    with op.batch_alter_table("backup_results") as batch:
        batch.add_column(sa.Column("started_at", sa.DateTime()))
        batch.add_column(sa.Column("finished_at", sa.DateTime()))
        batch.add_column(sa.Column("duration_seconds", sa.Float()))
        for name in RUN_INT_COLUMNS:
            batch.add_column(sa.Column(name, sa.Integer()))
        batch.add_column(sa.Column("log", sa.Text()))
        batch.create_index("ix_backup_results_started_at", ["started_at"])

    conn = op.get_bind()
    jobs = sa.table("backup_jobs", sa.column("id", sa.Integer), sa.column("status", sa.String),
                    sa.column("created_at", sa.DateTime))
    runs = sa.table("backup_results", sa.column("id", sa.Integer), sa.column("job_id", sa.Integer),
                    sa.column("timestamp", sa.String), sa.column("status", sa.String),
                    sa.column("details", sa.String), sa.column("log", sa.Text),
                    sa.column("started_at", sa.DateTime), sa.column("finished_at", sa.DateTime))

    conn.execute(runs.update().where(runs.c.status == "completed").values(status="success"))
    conn.execute(jobs.update().where(jobs.c.status == "completed").values(status="success"))
    conn.execute(runs.update().values(log=runs.c.details))

    # The legacy timestamp was written when the run ended, so it is also the finish time.
    first_run = {}
    for run_id, job_id, timestamp in conn.execute(sa.select(runs.c.id, runs.c.job_id, runs.c.timestamp)).all():
        at = parse_iso(timestamp)
        if at is None:
            continue
        if at.tzinfo is not None:
            at = at.astimezone().replace(tzinfo=None)
        conn.execute(runs.update().where(runs.c.id == run_id).values(started_at=at, finished_at=at))
        if job_id not in first_run or at < first_run[job_id]:
            first_run[job_id] = at

    now = datetime.now()
    for (job_id,) in conn.execute(sa.select(jobs.c.id)).all():
        conn.execute(jobs.update().where(jobs.c.id == job_id).values(created_at=first_run.get(job_id, now)))


def downgrade():
    with op.batch_alter_table("backup_results") as batch:
        batch.drop_index("ix_backup_results_started_at")
        for name in ["started_at", "finished_at", "duration_seconds", *RUN_INT_COLUMNS, "log"]:
            batch.drop_column(name)
    with op.batch_alter_table("backup_jobs") as batch:
        batch.drop_column("paused")
        batch.drop_column("created_at")
