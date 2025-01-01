from fastapi import FastAPI
from app.db.session import engine, database, Base
from app.routes import backup
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager

# Create the FastAPI app instance
app = FastAPI()

# Create all tables in the database
Base.metadata.create_all(bind=engine)

# Include the router from backup module
app.include_router(backup.router)

# Initialize and start APScheduler
scheduler = BackgroundScheduler()
scheduler.start()

# Use lifespan for lifespan events
@asynccontextmanager
async def app_lifespan(app: FastAPI):
    # Startup: actions to perform at startup
    await database.connect()
    yield
    # Shutdown: actions to perform at shutdown
    await database.disconnect()

app = FastAPI(lifespan=app_lifespan)

@app.get("/")
async def root():
    # A simple root endpoint
    return {"message": "Welcome to the Backup Management API"}