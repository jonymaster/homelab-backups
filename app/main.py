import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from utils.scheduler_service import schedule_all_jobs
from utils.backup_utils import reset_stale_jobs
from db.session import engine, Base
from routes.backup_job import router as backup_job_router
from routes.backup_result import router as backup_result_router
from routes.filesystem import router as filesystem_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
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

Base.metadata.create_all(bind=engine)

app.include_router(backup_job_router)
app.include_router(backup_result_router)
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
