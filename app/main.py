import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from utils.scheduler_service import schedule_all_jobs
from db.session import engine, database, Base
from routes.backup_job import router as backup_job_router
from routes.backup_result import router as backup_result_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_jobs_status():
    pass

scheduler = BackgroundScheduler()
scheduler.add_job(check_jobs_status, 'interval', minutes=30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    schedule_all_jobs()
    yield
    await database.disconnect()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(backup_job_router)
app.include_router(backup_result_router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Backup Management API"}

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return {"message": "Preflight request handled"}