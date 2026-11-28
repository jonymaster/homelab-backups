import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from db.session import engine as default_engine

ALEMBIC_INI = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic.ini")
BASELINE = "0001"


def run_migrations(engine=default_engine):
    """Upgrade the database to head, adopting databases created before migrations existed."""
    config = Config(ALEMBIC_INI)
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        tables = inspect(connection).get_table_names()
        if "backup_jobs" in tables and "alembic_version" not in tables:
            command.stamp(config, BASELINE)
        command.upgrade(config, "head")
