import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.migrate import run_migrations
from utils.scheduler_service import schedule_all_jobs
from utils.backup_utils import reset_stale_jobs
from routes.backup_job import router as backup_job_router
from routes.backup_result import router as backup_result_router
from routes.dashboard import router as dashboard_router
from routes.filesystem import router as filesystem_router
from routes.runs import router as runs_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    reset_stale_jobs()
    schedule_all_jobs()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backup_job_router)
app.include_router(backup_result_router)
app.include_router(runs_router)
app.include_router(dashboard_router)
app.include_router(filesystem_router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Backup Management API"}

@app.get("/health")
@app.get("/health/")
async def health():
    return {"status": "ok"}

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return {"message": "Preflight request handled"}
