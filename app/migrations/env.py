from alembic import context

from db.session import engine


def run(connection):
    context.configure(connection=connection, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is None:
    with engine.connect() as connection:
        run(connection)
else:
    run(connection)
