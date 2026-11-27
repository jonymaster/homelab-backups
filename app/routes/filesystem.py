from fastapi import APIRouter, HTTPException
import os

router = APIRouter()

ALLOWED_ROOTS = [
    root.strip()
    for root in os.getenv("ALLOWED_ROOTS", "/app/source,/app/destination").split(",")
    if root.strip()
]

def is_allowed(path: str) -> bool:
    real = os.path.realpath(path)
    for root in ALLOWED_ROOTS:
        real_root = os.path.realpath(root)
        if real == real_root or real.startswith(real_root + os.sep):
            return True
    return False

@router.get("/list-directory")
def list_directory(path: str):
    if not is_allowed(path):
        raise HTTPException(status_code=403, detail="Path is outside the allowed directories")
    try:
        directories = [
            d for d in os.listdir(path)
            if os.path.isdir(os.path.join(path, d)) and not d.startswith('.')
        ]
        return {"directories": directories}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error listing directory: {str(e)}")
