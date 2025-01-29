from fastapi import APIRouter, HTTPException
import os

router = APIRouter()

@router.get("/list-directory")
def list_directory(path: str):
    try:
        directories = [
            d for d in os.listdir(path)
            if os.path.isdir(os.path.join(path, d)) and not d.startswith('.')
        ]
        return {"directories": directories}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error listing directory: {str(e)}")