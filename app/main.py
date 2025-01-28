import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from utils.scheduler_service import schedule_all_jobs
from db.session import engine, database, Base
from routes.backup_job import router as backup_job_router
from routes.backup_result import router as backup_result_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_jobs_status():
    # Process to check job status and update database
    pass

# Initialize Scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(check_jobs_status, 'interval', minutes=30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    schedule_all_jobs()  # Schedule once at initial startup
    yield
    await database.disconnect()

# Initialize the FastAPI app with lifespan context
app = FastAPI(lifespan=lifespan)

# Add CORS middleware with simplified configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# Create all tables in the database
Base.metadata.create_all(bind=engine)

# Include the routers for the API
app.include_router(backup_job_router)
app.include_router(backup_result_router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Backup Management API"}

# Explicitly handle OPTIONS requests
@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return {"message": "Preflight request handled"}