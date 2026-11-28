"""Add settings, notification channels/log/state and job retention, excludes, notify, ping URL.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

JOB_COLUMNS = ["retention_days", "exclude_presets", "exclude_patterns", "notify", "ping_url", "stale_notified_at"]


def upgrade():
    # Existing jobs keep all history: retention_days stays NULL.
    with op.batch_alter_table("backup_jobs") as batch:
        batch.add_column(sa.Column("retention_days", sa.Integer()))
        batch.add_column(sa.Column("exclude_presets", sa.JSON(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("exclude_patterns", sa.JSON(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("notify", sa.String(), nullable=False, server_default="default"))
        batch.add_column(sa.Column("ping_url", sa.String()))
        batch.add_column(sa.Column("stale_notified_at", sa.DateTime()))

    op.create_table(
        "settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
    )
    op.create_table(
        "notification_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "notification_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("job_id", sa.Integer()),
        sa.Column("job_name", sa.String()),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text()),
    )
    op.create_index("ix_notification_log_at", "notification_log", ["at"])
    op.create_table(
        "notification_state",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("notification_state")
    op.drop_table("notification_log")
    op.drop_table("notification_channels")
    op.drop_table("settings")
    with op.batch_alter_table("backup_jobs") as batch:
        for name in JOB_COLUMNS:
            batch.drop_column(name)
