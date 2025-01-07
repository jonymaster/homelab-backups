from fastapi import FastAPI
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler

from app.db.session import engine, database, Base
from app.routes.backup_job import router as backup_job_router
from app.routes.backup_result import router as backup_result_router
from app.utils.scheduler_service import schedule_all_jobs

def check_jobs_status():
    # Process to check job status and update database
    pass

# Initialize Scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(check_jobs_status, 'interval', minutes=30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Actions before the app starts
    await database.connect()
    schedule_all_jobs()  # Schedule jobs on startup
    yield
    # Actions after the app shuts down
    await database.disconnect()

# Initialize FastAPI with the lifespan event handler
app = FastAPI(lifespan=lifespan)

# Create all tables in the database
Base.metadata.create_all(bind=engine)

# Include the routers for the API
app.include_router(backup_job_router)
app.include_router(backup_result_router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Backup Management API"}