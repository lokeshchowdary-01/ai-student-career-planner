"""
Cloud Deployment Entrypoint for Render / Heroku / Railway.
Allows starting FastAPI either from the repository root:
    uvicorn main:app --host 0.0.0.0 --port $PORT
or from within the backend directory:
    cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so modules resolve correctly
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from backend.main import app

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
