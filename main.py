from fastapi import FastAPI
from app.db.session import engine, database, Base
from app.routes.backup_job import router as backup_job_router  # Import the backup_job router
from app.routes.backup_result import router as backup_result_router  # If applicable
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler

def check_jobs_status():
    # Process to check job status and update database
    pass

# Initialize Scheduler in main.py
scheduler = BackgroundScheduler()
scheduler.add_job(check_jobs_status, 'interval', minutes=30)
scheduler.start()

# Use lifespan for handling startup and shutdown events
@asynccontextmanager
async def app_lifespan(app: FastAPI):
    # Startup: actions to perform at startup
    await database.connect()
    yield
    # Shutdown: actions to perform at shutdown
    await database.disconnect()

# Initialize FastAPI app with lifespan
app = FastAPI(lifespan=app_lifespan)

# Create all tables in the database
Base.metadata.create_all(bind=engine)

# Include the routers
app.include_router(backup_job_router)  # Include the router for backup jobs
app.include_router(backup_result_router)  # Include the router for backup results

# Initialize and start APScheduler (for scheduling tasks)
scheduler = BackgroundScheduler()
scheduler.start()

@app.get("/")
async def root():
    # A simple root endpoint
    return {"message": "Welcome to the Backup Management API"}