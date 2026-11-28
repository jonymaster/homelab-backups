"""Baseline: schema as created by Base.metadata.create_all before migrations.

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "backup_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String()),
        sa.Column("source", sa.String()),
        sa.Column("destination", sa.String()),
        sa.Column("schedule", sa.String()),
        sa.Column("status", sa.String()),
    )
    op.create_index("ix_backup_jobs_id", "backup_jobs", ["id"])
    op.create_index("ix_backup_jobs_name", "backup_jobs", ["name"], unique=True)
    op.create_index("ix_backup_jobs_source", "backup_jobs", ["source"])
    op.create_index("ix_backup_jobs_destination", "backup_jobs", ["destination"])
    op.create_index("ix_backup_jobs_schedule", "backup_jobs", ["schedule"])

    op.create_table(
        "backup_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("backup_jobs.id")),
        sa.Column("timestamp", sa.String()),
        sa.Column("status", sa.String()),
        sa.Column("result", sa.String()),
        sa.Column("details", sa.String()),
    )
    op.create_index("ix_backup_results_id", "backup_results", ["id"])
    op.create_index("ix_backup_results_timestamp", "backup_results", ["timestamp"])
    op.create_index("ix_backup_results_status", "backup_results", ["status"])
    op.create_index("ix_backup_results_result", "backup_results", ["result"])
    op.create_index("ix_backup_results_details", "backup_results", ["details"])


def downgrade():
    op.drop_table("backup_results")
    op.drop_table("backup_jobs")
