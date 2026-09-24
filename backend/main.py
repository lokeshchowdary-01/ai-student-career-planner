import os
import re
import time
import secrets
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import date, timedelta
from collections import defaultdict
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status, Header, Depends, Cookie, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
import psycopg
from psycopg.rows import dict_row

from rag_service import search_knowledge_chunks, ingest_knowledge_base
from auth_service import (
    hash_password,
    verify_password,
    create_user_session,
    get_user_from_token,
    revoke_session,
    SESSION_COOKIE_NAME,
    set_session_cookie,
    clear_session_cookie
)

app = FastAPI(title="AI Student Career & Skill Planner API")

dotenv_path = Path(__file__).resolve().parent / ".env"

def get_cors_origins() -> List[str]:
    load_dotenv(dotenv_path=dotenv_path, override=True)
    origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # Merge custom CORS_ORIGINS from environment variable (comma-separated)
    raw_cors = os.getenv("CORS_ORIGINS", "")
    if raw_cors.strip():
        for o in raw_cors.split(","):
            val = o.strip()
            if val and val not in origins:
                origins.append(val)

    # Merge FRONTEND_URL environment variable (e.g. from Vercel deployment)
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)

    # Merge VERCEL_URL environment variable (auto-provided by Vercel)
    vercel_url = os.getenv("VERCEL_URL", "").strip()
    if vercel_url:
        if not vercel_url.startswith("http"):
            vercel_url = f"https://{vercel_url}"
        if vercel_url not in origins:
            origins.append(vercel_url)

    return origins


# Allow frontend to communicate with backend (including all Vercel production and preview domains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=r"https:\/\/.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_database_url():
    """Reads DATABASE_URL dynamically, reloading .env if changed."""
    load_dotenv(dotenv_path=dotenv_path, override=True)
    return os.getenv("DATABASE_URL")


def get_db_connection():
    """Establishes a connection to PostgreSQL using dict_row factory."""
    db_url = get_database_url()
    if not db_url or "YOUR_PASSWORD" in db_url:
        raise HTTPException(
            status_code=500,
            detail="DATABASE_URL is not properly configured. Please update backend/.env with your PostgreSQL password."
        )
    try:
        return psycopg.connect(db_url, row_factory=dict_row)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection error: {str(e)}"
        )


class SkillPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., min_length=1, max_length=50)
    level: str = Field(..., min_length=1, max_length=50)


# Sliding window rate limiter for expensive AI operations
_ai_rate_limits = defaultdict(list)
AI_MAX_REQUESTS_PER_MINUTE = 30


def check_ai_rate_limit(client_id: str) -> None:
    now = time.time()
    cutoff = now - 60.0
    _ai_rate_limits[client_id] = [t for t in _ai_rate_limits[client_id] if t > cutoff]
    if len(_ai_rate_limits[client_id]) >= AI_MAX_REQUESTS_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI Assistant rate limit exceeded (max 30 requests per minute). Please wait a moment before sending another request."
        )
    _ai_rate_limits[client_id].append(now)


def extract_token_from_request(
    authorization: Any = None,
    learnorbit_session: Any = None
) -> Optional[str]:
    """Extracts session token from either Authorization header or HttpOnly cookie."""
    if isinstance(authorization, str) and authorization.startswith("Bearer "):
        tok = authorization.split(" ", 1)[1].strip()
        if tok:
            return tok
    if isinstance(learnorbit_session, str) and learnorbit_session.strip():
        return learnorbit_session.strip()
    return None


def resolve_user(
    authorization: Any = Header(None),
    learnorbit_session: Any = Cookie(None)
) -> Dict[str, Any]:
    """
    Extracts authenticated user from Authorization header (Bearer <token>)
    or secure HttpOnly session cookie (learnorbit_session).

    ENVIRONMENT & Security Rules:
    - If ENVIRONMENT=production (or default production setting, or AUTH_REQUIRED=true):
      Unauthenticated protected requests strictly return 401 Unauthorized.
      Never automatically resolves to user_id=1 (Alex Rivera).
    - If ENVIRONMENT=development (and AUTH_REQUIRED is not explicitly true):
      Temporarily preserves demo fallback to user_id=1 for smooth local development.
    """
    auth_str = authorization if isinstance(authorization, str) else None
    cookie_str = learnorbit_session if isinstance(learnorbit_session, str) else None
    token = extract_token_from_request(auth_str, cookie_str)
    if token:
        try:
            with get_db_connection() as conn:
                user = get_user_from_token(conn, token)
                if user:
                    return user
        except Exception:
            pass

    env = os.getenv("ENVIRONMENT", "development").lower().strip()
    auth_required = os.getenv("AUTH_REQUIRED", "false").lower() in ("true", "1", "yes")

    # In production mode or when auth is explicitly enforced: strict 401!
    if env == "production" or auth_required:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in or provide a valid session token."
        )

    # In development mode ONLY: temporarily preserve demo fallback
    if env == "development":
        return {
            "id": 1,
            "name": "Alex Rivera",
            "email": "alex.rivera@example.com"
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please log in."
    )


def require_auth(
    authorization: Any = Header(None),
    learnorbit_session: Any = Cookie(None)
) -> Dict[str, Any]:
    """
    Strict auth dependency that requires a valid, active session token from
    either Authorization header or HttpOnly session cookie.
    Raises 401 Unauthorized if not authenticated.
    """
    auth_str = authorization if isinstance(authorization, str) else None
    cookie_str = learnorbit_session if isinstance(learnorbit_session, str) else None
    token = extract_token_from_request(auth_str, cookie_str)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please include 'Authorization: Bearer <token>' header or session cookie."
        )
    try:
        with get_db_connection() as conn:
            user = get_user_from_token(conn, token)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired session token. Please log in again."
                )
            return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )


class UserRegisterPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class UserLoginPayload(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class RAGSearchPayload(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(5, ge=1, le=20)


@app.get("/")
def home():
    return {
        "message": "Student Career Planner API is running!",
        "version": "1.0.0",
        "features": {
            "skills": True,
            "career_goals": True,
            "learning_planner": True,
            "study_activity": True,
            "ai_mentor": True,
            "rag_pgvector": True,
            "authentication": True,
            "today_plan": True,
            "career_assessment": True,
            "skill_evidence": True,
            "projects": True,
            "career_preparation": True
        }
    }


# ==========================================
# PHASE 7: AUTHENTICATION ENDPOINTS
# ==========================================

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegisterPayload, response: Response):
    """
    Registers a new student user:
    - Validates email format
    - Hashes password using bcrypt
    - Persists user into PostgreSQL
    - Initializes default career goal
    - Creates secure session token
    """
    clean_email = payload.email.strip().lower()
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", clean_email):
        raise HTTPException(status_code=400, detail="Invalid email format.")

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check for existing email
                cur.execute("SELECT id FROM users WHERE email = %s;", (clean_email,))
                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="An account with this email address already exists."
                    )

                hashed_pw = hash_password(payload.password)
                cur.execute(
                    """
                    INSERT INTO users (name, email, password_hash)
                    VALUES (%s, %s, %s)
                    RETURNING id, name, email, created_at;
                    """,
                    (payload.name.strip(), clean_email, hashed_pw)
                )
                user = cur.fetchone()
                user_id = user["id"]

                # Initialize default career goal for new user
                cur.execute(
                    """
                    INSERT INTO student_career_goals 
                    (student_name, career_role_id, target_date, target_industries, target_locations, user_id)
                    VALUES (%s, 1, 'December 2026', 'Tech, Cloud Platforms', 'Remote', %s);
                    """,
                    (user["name"], user_id)
                )
            conn.commit()

            # Create session
            token = create_user_session(conn, user_id)
            is_prod = (os.getenv("ENVIRONMENT", "development").lower() == "production")
            set_session_cookie(response, token, is_production=is_prod)

            return {
                "message": "User registered successfully",
                "token": token,
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                    "created_at": user["created_at"].isoformat() if user.get("created_at") else None
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Registration failed: {str(e)}"
        )


@app.post("/api/auth/login")
def login_user(payload: UserLoginPayload, response: Response):
    """
    Authenticates an existing user:
    - Verifies bcrypt password hash
    - Generates 64-char session token
    - Sets secure HttpOnly session cookie
    """
    clean_email = payload.email.strip().lower()
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, email, password_hash, created_at FROM users WHERE email = %s;",
                    (clean_email,)
                )
                user = cur.fetchone()

            if not user or not verify_password(payload.password, user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password."
                )

            token = create_user_session(conn, user["id"])
            is_prod = (os.getenv("ENVIRONMENT", "development").lower() == "production")
            set_session_cookie(response, token, is_production=is_prod)

            return {
                "message": "Login successful",
                "token": token,
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                    "created_at": user["created_at"].isoformat() if user.get("created_at") else None
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Login failed: {str(e)}"
        )


@app.post("/api/auth/logout")
def logout_user(
    response: Response,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """
    Revokes the current user's session token and clears the HttpOnly session cookie.
    """
    token = extract_token_from_request(authorization, learnorbit_session)
    if token:
        try:
            with get_db_connection() as conn:
                revoke_session(conn, token)
        except Exception:
            pass
    clear_session_cookie(response)
    return {"message": "Successfully logged out"}


@app.get("/api/auth/me")
def get_current_user_profile(user: Dict[str, Any] = Depends(require_auth)):
    """
    Returns profile information for the authenticated user.
    """
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None
    }


# ==========================================
# PHASE 6: RAG + SEMANTIC SEARCH ENDPOINTS
# ==========================================

@app.post("/api/rag/search")
def rag_semantic_search(payload: RAGSearchPayload):
    """
    Performs real semantic search across the verified engineering knowledge base
    using real dense Gemini embeddings and cosine similarity against PostgreSQL chunks.
    """
    try:
        with get_db_connection() as conn:
            results = search_knowledge_chunks(conn, payload.query, top_k=payload.top_k)
            return {
                "query": payload.query,
                "count": len(results),
                "results": results
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(e)}"
        )


@app.post("/api/rag/ingest")
def rag_ingest_starter_knowledge(
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    Ingests the starter engineering curriculum into PostgreSQL
    with real 768-dimensional Gemini embeddings.
    Protected: Restricted to administrators to prevent unauthorized embedding API quota consumption.
    """
    admin_secret = os.getenv("ADMIN_INGEST_KEY", "admin-ingest-secret-2026")
    is_admin = False

    # Check X-Admin-Key header first
    if x_admin_key and secrets.compare_digest(x_admin_key.strip(), admin_secret):
        is_admin = True
    else:
        # Require authenticated user with admin rights
        auth_str = authorization if isinstance(authorization, str) else None
        cookie_str = learnorbit_session if isinstance(learnorbit_session, str) else None
        token = extract_token_from_request(auth_str, cookie_str)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please provide a valid admin session or X-Admin-Key."
            )
        try:
            with get_db_connection() as conn:
                user = get_user_from_token(conn, token)
                if not user:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token.")
                if user.get("is_admin") is True or user.get("email") in ("admin@learnorbit.com", "admin@example.com"):
                    is_admin = True
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error during admin check: {str(e)}")

    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Knowledge ingestion requires administrator privileges or a valid X-Admin-Key."
        )

    try:
        with get_db_connection() as conn:
            summary = ingest_knowledge_base(conn)
            return {
                "message": "Knowledge base ingestion completed",
                "status": summary.get("status", "success"),
                "summary": summary
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Knowledge base ingestion failed: {str(e)}"
        )


@app.get("/api/skills")
def get_skills(
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Fetches all skills for the current user from the PostgreSQL skills table."""
    user = resolve_user(authorization, learnorbit_session)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, category, level FROM skills WHERE user_id = %s ORDER BY id ASC;",
                    (user["id"],)
                )
                skills = cur.fetchall()
                return skills
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch skills from database: {str(e)}"
        )


@app.post("/api/skills", status_code=status.HTTP_201_CREATED)
def create_skill(
    skill: SkillPayload,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Inserts a new skill for the current user into the PostgreSQL database."""
    user = resolve_user(authorization, learnorbit_session)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO skills (name, category, level, user_id)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, name, category, level;
                    """,
                    (skill.name, skill.category, skill.level, user["id"])
                )
                new_skill = cur.fetchone()
            conn.commit()
            return new_skill
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create skill: {str(e)}"
        )


@app.put("/api/skills/{skill_id}")
def update_skill(
    skill_id: int,
    skill: SkillPayload,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Updates an existing skill belonging to the current user in the PostgreSQL database."""
    user = resolve_user(authorization, learnorbit_session)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE skills
                    SET name = %s, category = %s, level = %s
                    WHERE id = %s AND user_id = %s
                    RETURNING id, name, category, level;
                    """,
                    (skill.name, skill.category, skill.level, skill_id, user["id"])
                )
                updated_skill = cur.fetchone()
                if not updated_skill:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Skill with id {skill_id} not found"
                    )
            conn.commit()
            return updated_skill
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update skill: {str(e)}"
        )


@app.delete("/api/skills/{skill_id}")
def delete_skill(
    skill_id: int,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Deletes a skill belonging to the current user from the PostgreSQL database."""
    user = resolve_user(authorization, learnorbit_session)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM skills WHERE id = %s AND user_id = %s RETURNING id;",
                    (skill_id, user["id"])
                )
                deleted_record = cur.fetchone()
                if not deleted_record:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Skill with id {skill_id} not found"
                    )
            conn.commit()
            return {"message": "Skill deleted successfully", "id": skill_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete skill: {str(e)}"
        )


class CareerGoalPayload(BaseModel):
    career_role_id: int
    student_name: Optional[str] = None
    target_date: Optional[str] = None
    target_industries: Optional[str] = None
    target_locations: Optional[str] = None


@app.get("/api/career-roles")
def get_career_roles():
    """Fetches all predefined career roles."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, description, created_at FROM career_roles ORDER BY id ASC;")
                roles = cur.fetchall()
                return roles
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch career roles: {str(e)}"
        )


@app.get("/api/career-roles/{role_id}")
def get_career_role(role_id: int):
    """Fetches a specific career role with all its required skills and weights."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, description, created_at FROM career_roles WHERE id = %s;", (role_id,))
                role = cur.fetchone()
                if not role:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Career role with id {role_id} not found"
                    )
                cur.execute(
                    """
                    SELECT id, skill_name, category, importance, weight
                    FROM career_required_skills
                    WHERE career_role_id = %s
                    ORDER BY weight DESC, importance ASC, skill_name ASC;
                    """,
                    (role_id,)
                )
                role["required_skills"] = cur.fetchall()
                return role
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch career role details: {str(e)}"
        )


@app.get("/api/career-goal")
def get_career_goal(
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Fetches the active student career goal for the current user."""
    user = resolve_user(authorization, learnorbit_session)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 
                        g.id,
                        g.student_name,
                        g.career_role_id,
                        r.name AS role_name,
                        r.description AS role_description,
                        g.target_date,
                        g.target_industries,
                        g.target_locations,
                        g.updated_at
                    FROM student_career_goals g
                    JOIN career_roles r ON g.career_role_id = r.id
                    WHERE g.user_id = %s
                    ORDER BY g.id ASC
                    LIMIT 1;
                    """,
                    (user_id,)
                )
                goal = cur.fetchone()
                if not goal:
                    # If none exists yet for this user, initialize default
                    cur.execute("SELECT id FROM career_roles ORDER BY id ASC LIMIT 1;")
                    default_role = cur.fetchone()
                    default_role_id = default_role["id"] if default_role else 1
                    cur.execute(
                        """
                        INSERT INTO student_career_goals 
                        (student_name, career_role_id, target_date, target_industries, target_locations, user_id)
                        VALUES (%s, %s, 'December 2026', 'AI Platforms, Cloud Infrastructure, Fintech', 'San Francisco, CA / Remote', %s)
                        ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
                        RETURNING id, student_name, career_role_id, target_date, target_industries, target_locations, updated_at;
                        """,
                        (user["name"], default_role_id, user_id)
                    )
                    inserted = cur.fetchone()
                    conn.commit()
                    cur.execute(
                        """
                        SELECT 
                            g.id,
                            g.student_name,
                            g.career_role_id,
                            r.name AS role_name,
                            r.description AS role_description,
                            g.target_date,
                            g.target_industries,
                            g.target_locations,
                            g.updated_at
                        FROM student_career_goals g
                        JOIN career_roles r ON g.career_role_id = r.id
                        WHERE g.id = %s;
                        """,
                        (inserted["id"],)
                    )
                    goal = cur.fetchone()
                return goal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch student career goal: {str(e)}"
        )


@app.put("/api/career-goal")
def update_career_goal(
    payload: CareerGoalPayload,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """Updates or sets the student career goal for the authenticated user."""
    user = resolve_user(authorization, learnorbit_session)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Validate career role exists
                cur.execute("SELECT id, name, description FROM career_roles WHERE id = %s;", (payload.career_role_id,))
                role = cur.fetchone()
                if not role:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Career role with id {payload.career_role_id} not found"
                    )

                cur.execute(
                    """
                    INSERT INTO student_career_goals 
                    (student_name, career_role_id, target_date, target_industries, target_locations, user_id)
                    VALUES (%s, %s, COALESCE(%s, 'December 2026'), %s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE
                    SET career_role_id = EXCLUDED.career_role_id,
                        student_name = COALESCE(EXCLUDED.student_name, student_career_goals.student_name),
                        target_date = COALESCE(EXCLUDED.target_date, student_career_goals.target_date),
                        target_industries = COALESCE(EXCLUDED.target_industries, student_career_goals.target_industries),
                        target_locations = COALESCE(EXCLUDED.target_locations, student_career_goals.target_locations),
                        updated_at = NOW()
                    RETURNING id, student_name, career_role_id, target_date, target_industries, target_locations, updated_at;
                    """,
                    (
                        payload.student_name or user["name"],
                        payload.career_role_id,
                        payload.target_date,
                        payload.target_industries or "Tech, Cloud Platforms",
                        payload.target_locations or "Remote",
                        user_id
                    )
                )
                updated_goal = cur.fetchone()
                conn.commit()

                updated_goal["role_name"] = role["name"]
                updated_goal["role_description"] = role["description"]
                return updated_goal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update student career goal: {str(e)}"
        )


@app.get("/api/career-gap-analysis")
def get_career_gap_analysis(
    role_id: Optional[int] = None,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    user = resolve_user(authorization, learnorbit_session)
    """
    Computes a weighted career skill-gap analysis.
    If role_id is omitted, analyzes against the student's active career goal.
    
    Readiness calculation:
      Advanced = 1.0
      Intermediate = 0.8
      Beginner = 0.5
      Missing = 0.0
      
      earned_points = weight * proficiency_multiplier
      readiness_percentage = round(total_earned_points / total_possible_weight * 100)
      
    Skill matching is case-insensitive.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                target_role_id = role_id
                if not target_role_id:
                    cur.execute("SELECT career_role_id FROM student_career_goals WHERE user_id = %s ORDER BY id ASC LIMIT 1;", (user_id,))
                    goal_row = cur.fetchone()
                    if goal_row:
                        target_role_id = goal_row["career_role_id"]
                    else:
                        cur.execute("SELECT id FROM career_roles ORDER BY id ASC LIMIT 1;")
                        first_role = cur.fetchone()
                        if first_role:
                            target_role_id = first_role["id"]

                if not target_role_id:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="No career roles configured."
                    )

                cur.execute("SELECT id, name, description FROM career_roles WHERE id = %s;", (target_role_id,))
                role = cur.fetchone()
                if not role:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Career role with id {target_role_id} not found"
                    )

                cur.execute(
                    """
                    SELECT id, skill_name, category, importance, weight
                    FROM career_required_skills
                    WHERE career_role_id = %s
                    ORDER BY weight DESC, skill_name ASC;
                    """,
                    (target_role_id,)
                )
                required_skills = cur.fetchall()

                cur.execute("SELECT id, name, category, level FROM skills WHERE user_id = %s ORDER BY id ASC;", (user_id,))
                student_skills = cur.fetchall()

        # Case-insensitive map of student's skills
        student_skills_map = {}
        for s in student_skills:
            key = s["name"].strip().lower()
            if key not in student_skills_map:
                student_skills_map[key] = s
            else:
                level_rank = {"advanced": 3, "intermediate": 2, "beginner": 1}
                current_lvl = student_skills_map[key]["level"].lower()
                new_lvl = s["level"].lower()
                if level_rank.get(new_lvl, 0) > level_rank.get(current_lvl, 0):
                    student_skills_map[key] = s

        total_possible_weight = 0
        total_earned_points = 0.0
        matched_skills = []
        missing_skills = []

        for req in required_skills:
            weight = req["weight"]
            total_possible_weight += weight
            req_key = req["skill_name"].strip().lower()

            if req_key in student_skills_map:
                student_skill = student_skills_map[req_key]
                lvl_str = (student_skill["level"] or "").strip().lower()
                if "adv" in lvl_str:
                    mult = 1.0
                elif "inter" in lvl_str:
                    mult = 0.8
                elif "beg" in lvl_str:
                    mult = 0.5
                else:
                    mult = 0.0

                earned = round(weight * mult, 2)
                total_earned_points += earned

                matched_skills.append({
                    "id": req["id"],
                    "skill_name": req["skill_name"],
                    "category": req["category"],
                    "importance": req["importance"],
                    "weight": weight,
                    "student_skill_id": student_skill["id"],
                    "student_level": student_skill["level"],
                    "proficiency_multiplier": mult,
                    "earned_points": earned,
                    "status": "Advanced Mastery" if mult == 1.0 else ("Intermediate Competency" if mult == 0.8 else "Beginner Level")
                })
            else:
                missing_skills.append({
                    "id": req["id"],
                    "skill_name": req["skill_name"],
                    "category": req["category"],
                    "importance": req["importance"],
                    "weight": weight,
                    "proficiency_multiplier": 0.0,
                    "earned_points": 0.0,
                    "status": "Missing"
                })

        readiness_percentage = round((total_earned_points / total_possible_weight) * 100) if total_possible_weight > 0 else 0

        # Recommended next skills: prioritize missing skills by weight DESC, then importance Core > High > Medium
        importance_rank = {"core": 3, "high": 2, "medium": 1}
        recommended_next_skills = sorted(
            missing_skills,
            key=lambda s: (s["weight"], importance_rank.get(s["importance"].lower(), 0)),
            reverse=True
        )

        return {
            "role_id": role["id"],
            "role_name": role["name"],
            "role_description": role["description"],
            "readiness_percentage": readiness_percentage,
            "total_skills_required": len(required_skills),
            "matched_count": len(matched_skills),
            "missing_count": len(missing_skills),
            "total_earned_points": round(total_earned_points, 1),
            "total_possible_weight": total_possible_weight,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "recommended_next_skills": recommended_next_skills,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to perform gap analysis: {str(e)}"
        )


# ==============================================================================
# Step 2: Personalized Learning Planner APIs
# ==============================================================================

class MilestoneUpdatePayload(BaseModel):
    completed: Optional[bool] = None
    title: Optional[str] = None
    category: Optional[str] = None


class StudyActivityPayload(BaseModel):
    activity_date: Optional[str] = None
    minutes_spent: int = Field(default=60, ge=1, le=1440)
    activities_completed: int = Field(default=1, ge=1)
    focus_area: Optional[str] = None


@app.get("/api/learning-resources")
def get_learning_resources(skill_name: Optional[str] = None):
    """
    Fetches curated learning materials.
    Optionally filters case-insensitively by skill_name.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if skill_name:
                    cur.execute(
                        """
                        SELECT id, skill_name, title, url, resource_type, difficulty, estimated_hours, created_at
                        FROM learning_resources
                        WHERE LOWER(TRIM(skill_name)) = LOWER(TRIM(%s))
                        ORDER BY difficulty ASC, id ASC;
                        """,
                        (skill_name,)
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, skill_name, title, url, resource_type, difficulty, estimated_hours, created_at
                        FROM learning_resources
                        ORDER BY skill_name ASC, difficulty ASC, id ASC;
                        """
                    )
                return cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch learning resources: {str(e)}"
        )


@app.get("/api/learning-milestones")
def get_learning_milestones(category: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """
    Fetches curriculum milestones from PostgreSQL for the current user.
    Auto-initializes user milestones from template if none exist yet.
    Optionally filters by category.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if this user has milestones
                cur.execute("SELECT count(*) as count FROM learning_milestones WHERE user_id = %s;", (user_id,))
                cnt = cur.fetchone()["count"]
                if cnt == 0:
                    # Clone template milestones from user 1 (Alex Rivera) or standard template
                    cur.execute(
                        """
                        INSERT INTO learning_milestones (skill_name, category, title, completed, user_id)
                        SELECT skill_name, category, title, false, %s
                        FROM learning_milestones
                        WHERE user_id = 1
                        ORDER BY id ASC;
                        """,
                        (user_id,)
                    )
                    conn.commit()

                if category and category.lower() != "all":
                    cur.execute(
                        """
                        SELECT id, skill_name, category, title, completed, completed_at, created_at
                        FROM learning_milestones
                        WHERE user_id = %s AND category = %s
                        ORDER BY id ASC;
                        """,
                        (user_id, category)
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, skill_name, category, title, completed, completed_at, created_at
                        FROM learning_milestones
                        WHERE user_id = %s
                        ORDER BY id ASC;
                        """,
                        (user_id,)
                    )
                return cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch learning milestones: {str(e)}"
        )


@app.put("/api/learning-milestones/{milestone_id}")
def update_learning_milestone(milestone_id: int, payload: MilestoneUpdatePayload, authorization: Optional[str] = Header(None)):
    """
    Updates milestone completion status or details in PostgreSQL for the authenticated user.
    Ensures user isolation: User A cannot edit User B's milestones.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE learning_milestones
                    SET completed = COALESCE(%s, completed),
                        completed_at = CASE 
                            WHEN %s IS TRUE THEN NOW()
                            WHEN %s IS FALSE THEN NULL
                            ELSE completed_at
                        END,
                        title = COALESCE(%s, title),
                        category = COALESCE(%s, category)
                    WHERE id = %s AND user_id = %s
                    RETURNING id, skill_name, category, title, completed, completed_at, created_at;
                    """,
                    (
                        payload.completed,
                        payload.completed,
                        payload.completed,
                        payload.title,
                        payload.category,
                        milestone_id,
                        user_id
                    )
                )
                updated_row = cur.fetchone()
                if not updated_row:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Learning milestone with id {milestone_id} not found for current user"
                    )
                conn.commit()
                return updated_row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update milestone: {str(e)}"
        )


@app.post("/api/study-activity", status_code=status.HTTP_201_CREATED)
def log_study_activity(payload: StudyActivityPayload, authorization: Optional[str] = Header(None)):
    """
    Logs study session activity for the authenticated user.
    Upserts into study_activity_logs for the date and user_id.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        target_date = date.today()
        if payload.activity_date:
            try:
                target_date = date.fromisoformat(payload.activity_date)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid activity_date format. Expected YYYY-MM-DD."
                )

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO study_activity_logs (activity_date, minutes_spent, activities_completed, focus_area, user_id)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (activity_date, user_id) DO UPDATE
                    SET minutes_spent = study_activity_logs.minutes_spent + EXCLUDED.minutes_spent,
                        activities_completed = study_activity_logs.activities_completed + EXCLUDED.activities_completed,
                        focus_area = COALESCE(EXCLUDED.focus_area, study_activity_logs.focus_area)
                    RETURNING id, activity_date, minutes_spent, activities_completed, focus_area, created_at;
                    """,
                    (target_date, payload.minutes_spent, payload.activities_completed, payload.focus_area, user_id)
                )
                logged = cur.fetchone()
                conn.commit()
                return logged
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to log study activity: {str(e)}"
        )


@app.get("/api/study-activity")
def get_study_activity(authorization: Optional[str] = Header(None)):
    """
    Returns summary metrics, daily study logs, and streak calculations for current user.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, activity_date, minutes_spent, activities_completed, focus_area, created_at
                    FROM study_activity_logs
                    WHERE user_id = %s
                    ORDER BY activity_date DESC;
                    """,
                    (user_id,)
                )
                records = cur.fetchall()

        total_days = len(records)
        total_minutes = sum(r["minutes_spent"] for r in records)
        total_activities = sum(r["activities_completed"] for r in records)
        total_hours = round(total_minutes / 60.0, 1)

        dates_set = {r["activity_date"] for r in records}

        # Calculate current consecutive day streak
        current_streak = 0
        check_date = date.today()
        # If student hasn't logged today yet, start checking from yesterday
        if check_date not in dates_set:
            check_date -= timedelta(days=1)

        while check_date in dates_set:
            current_streak += 1
            check_date -= timedelta(days=1)

        # Calculate longest consecutive streak
        sorted_dates = sorted(list(dates_set))
        longest_streak = 0
        temp_streak = 0
        prev_date = None
        for d in sorted_dates:
            if prev_date is None or d == prev_date + timedelta(days=1):
                temp_streak += 1
            else:
                temp_streak = 1
            if temp_streak > longest_streak:
                longest_streak = temp_streak
            prev_date = d

        return {
            "total_days": total_days,
            "total_minutes": total_minutes,
            "total_hours": total_hours,
            "total_activities_completed": total_activities,
            "current_streak_days": current_streak,
            "longest_streak_days": longest_streak,
            "recent_activities": records
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch study activity: {str(e)}"
        )


@app.get("/api/learning-roadmap")
def get_learning_roadmap(role_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """
    Generates a personalized learning roadmap based on missing skills from the career gap analysis.
    Prioritizes high-weight/core skills first, attaches curated resources & milestones,
    and calculates projected readiness gains.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        # 1. Reuse existing career-gap-analysis logic
        gap = get_career_gap_analysis(role_id=role_id, authorization=authorization)

        target_role_id = gap["role_id"]
        role_name = gap["role_name"]
        role_desc = gap["role_description"]
        current_readiness = gap["readiness_percentage"]
        total_possible_weight = gap["total_possible_weight"]
        missing_skills = gap["missing_skills"]

        # 2. Fetch all learning resources and milestones from PostgreSQL for this user
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, skill_name, title, url, resource_type, difficulty, estimated_hours
                    FROM learning_resources
                    ORDER BY difficulty ASC, id ASC;
                    """
                )
                all_resources = cur.fetchall()

                cur.execute(
                    """
                    SELECT id, skill_name, category, title, completed
                    FROM learning_milestones
                    WHERE user_id = %s
                    ORDER BY id ASC;
                    """,
                    (user_id,)
                )
                all_milestones = cur.fetchall()

        # Build lookup maps by lowercase skill_name
        resources_map = {}
        for res in all_resources:
            key = res["skill_name"].strip().lower()
            resources_map.setdefault(key, []).append(res)

        milestones_map = {}
        for m in all_milestones:
            if m["skill_name"]:
                key = m["skill_name"].strip().lower()
                milestones_map.setdefault(key, []).append(m)

        # 3. Sort missing skills: Weight DESC, then Core > Important
        importance_rank = {"core": 3, "high": 2, "important": 2, "medium": 1}
        prioritized_missing = sorted(
            missing_skills,
            key=lambda s: (s["weight"], importance_rank.get(s["importance"].lower(), 0)),
            reverse=True
        )

        roadmap_steps = []
        cumulative_readiness = current_readiness

        for idx, skill in enumerate(prioritized_missing):
            s_name = skill["skill_name"]
            key = s_name.strip().lower()
            weight = skill["weight"]

            # Projected gain if mastered at 100% (Advanced 1.0)
            projected_gain = round((weight * 1.0 / total_possible_weight) * 100, 1) if total_possible_weight > 0 else 0
            cumulative_readiness = min(100, round(cumulative_readiness + projected_gain, 1))

            matched_resources = resources_map.get(key, [])
            matched_milestones = milestones_map.get(key, [])

            est_hours = sum(r["estimated_hours"] for r in matched_resources)
            if est_hours == 0:
                est_hours = weight * 4  # sensible fallback estimate

            roadmap_steps.append({
                "step_number": idx + 1,
                "skill_name": s_name,
                "category": skill["category"],
                "importance": skill["importance"],
                "weight": weight,
                "projected_gain_percentage": projected_gain,
                "cumulative_readiness": cumulative_readiness,
                "estimated_hours": est_hours,
                "resources_count": len(matched_resources),
                "resources": matched_resources,
                "milestones_count": len(matched_milestones),
                "milestones": matched_milestones
            })

        return {
            "role_id": target_role_id,
            "role_name": role_name,
            "role_description": role_desc,
            "current_readiness_percentage": current_readiness,
            "projected_max_readiness": 100,
            "total_missing_skills": len(missing_skills),
            "total_roadmap_steps": len(roadmap_steps),
            "roadmap_steps": roadmap_steps
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate learning roadmap: {str(e)}"
        )


# ==========================================
# STEP 5: AI CAREER ASSISTANT ENDPOINTS
# ==========================================

from ai_service import (
    get_ai_status,
    build_student_ai_context,
    build_system_instruction,
    call_gemini_api,
    generate_suggested_prompts,
    generate_ai_project_draft
)


class AIChatMessage(BaseModel):
    role: str = Field(..., min_length=1, max_length=50)
    content: str = Field(..., min_length=1, max_length=2000)


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[AIChatMessage]] = Field(default=[], max_length=10)
    role_id: Optional[int] = None


@app.get("/api/ai/status")
def get_ai_assistant_status():
    """
    Returns AI configuration status only:
    - configured
    - provider
    - model
    - has_api_key
    - env_var
    Never exposes or returns the actual API key.
    """
    return get_ai_status()


@app.get("/api/ai/suggested-prompts")
def get_ai_suggested_prompts(role_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """
    Generates intelligent prompts based on the student's active career role
    and current skill-gap data.
    """
    user = resolve_user(authorization)
    try:
        gap = get_career_gap_analysis(role_id=role_id, authorization=authorization)
        roadmap = get_learning_roadmap(role_id=role_id, authorization=authorization)
        study = get_study_activity(authorization=authorization)

        with get_db_connection() as conn:
            ctx = build_student_ai_context(
                conn,
                gap_info=gap,
                roadmap_info=roadmap,
                study_info=study,
                role_id=role_id,
                user_id=user["id"]
            )

        prompts = generate_suggested_prompts(ctx)
        return {
            "role_id": gap["role_id"],
            "role_name": gap["role_name"],
            "prompts": prompts
        }
    except Exception as e:
        return {
            "role_id": role_id,
            "role_name": "Target Role",
            "prompts": [
                "How can I improve my career readiness score?",
                "Which missing skill should I prioritize first?",
                "Suggest an optimal study schedule for this week."
            ]
        }


@app.post("/api/ai/chat")
def ai_career_chat(
    payload: AIChatRequest,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """
    Main conversational endpoint for the AI Career Mentor with RAG.
    Retrieves live student PostgreSQL records, compiles structured context,
    performs semantic search against PostgreSQL documentation chunks, queries Gemini,
    and returns reply with retrieved knowledge citations and context highlights.
    """
    user = resolve_user(authorization, learnorbit_session)
    user_id = user["id"]

    # Enforce AI abuse & rate limit protection (max 30 requests/min per user)
    check_ai_rate_limit(f"user_{user_id}")

    try:
        # 1. Fetch live PostgreSQL-derived domain data
        gap = get_career_gap_analysis(role_id=payload.role_id, authorization=authorization)
        roadmap = get_learning_roadmap(role_id=payload.role_id, authorization=authorization)
        study = get_study_activity(authorization=authorization)

        # 2. RAG Retrieval from knowledge base chunks (user-isolated, bounded top_k=3)
        retrieved_chunks = []
        try:
            with get_db_connection() as conn:
                retrieved_chunks = search_knowledge_chunks(
                    conn,
                    payload.message,
                    top_k=3,
                    min_similarity=0.35,
                    user_id=user_id
                )
        except Exception:
            retrieved_chunks = []

        # 3. Build comprehensive student context from PostgreSQL
        with get_db_connection() as conn:
            student_context = build_student_ai_context(
                conn,
                gap_info=gap,
                roadmap_info=roadmap,
                study_info=study,
                role_id=payload.role_id,
                user_id=user_id
            )

        # 4. Build grounded system instruction with RAG citations
        system_instruction = build_system_instruction(student_context, retrieved_knowledge=retrieved_chunks)

        # 5. Prepare message list (bounded to max 10 turns and 2000 chars per message)
        formatted_messages = []
        if payload.history:
            for h in payload.history[-10:]:
                formatted_messages.append({"role": h.role, "content": h.content[:2000]})
        formatted_messages.append({"role": "user", "content": payload.message[:2000]})

        # 6. Call Gemini API
        ai_reply = call_gemini_api(formatted_messages, system_instruction)

        # 7. Prepare context highlights
        recommended = student_context.get("recommended_next_skills", [])
        top_skill = recommended[0] if recommended else "Core Engineering Competencies"
        missing = student_context.get("missing_skills", [])

        return {
            "reply": ai_reply,
            "retrieved_knowledge": retrieved_chunks,
            "context_highlights": {
                "student_name": student_context.get("student_name", user["name"]),
                "role_name": gap.get("role_name"),
                "readiness_percentage": gap.get("readiness_percentage", 0),
                "top_recommended_skill": top_skill,
                "recommended_next_skills": recommended,
                "total_missing_skills": len(missing),
                "current_streak_days": study.get("current_streak_days", 0),
                "pending_milestones_count": student_context.get("milestones_summary", {}).get("pending_count", 0),
                "total_study_hours": study.get("total_hours", 0.0)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI Career Mentor encountered an error: {str(e)}"
        )


@app.post("/api/ai/rag-chat")
def ai_rag_chat_endpoint(
    payload: AIChatRequest,
    authorization: Optional[str] = Header(None),
    learnorbit_session: Optional[str] = Cookie(None)
):
    """
    Dedicated RAG endpoint for explicit semantic retrieval + student grounding.
    Maintains clean architectural separation while sharing the verified RAG pipeline.
    """
    return ai_career_chat(payload, authorization=authorization, learnorbit_session=learnorbit_session)


# ==============================================================================
# PHASE 8: PERSONALIZED "TODAY'S PLAN" ENDPOINTS
# ==============================================================================

class TodayPlanGeneratePayload(BaseModel):
    available_minutes: int = Field(default=60, ge=15, le=480)
    force_regenerate: bool = False


class TodayTaskUpdatePayload(BaseModel):
    status: str = Field(..., pattern="^(pending|in_progress|completed|skipped)$")
    minutes_spent: Optional[int] = Field(None, ge=1, le=480)


def generate_daily_tasks_for_user(conn, user_id: int, available_minutes: int) -> Dict[str, Any]:
    """
    Generates tailored daily study tasks dynamically using:
    - target career
    - skill gaps & weights
    - incomplete learning milestones
    - active projects & pending project milestones
    - available study time (30m, 1h, 2h, 3h, custom)
    """
    with conn.cursor() as cur:
        # 1. Fetch user's active career goal
        cur.execute(
            """
            SELECT g.career_role_id, r.name AS role_name
            FROM student_career_goals g
            JOIN career_roles r ON g.career_role_id = r.id
            WHERE g.user_id = %s
            ORDER BY g.id ASC LIMIT 1;
            """,
            (user_id,)
        )
        goal = cur.fetchone()
        role_name = goal["role_name"] if goal else "Software Engineer"
        role_id = goal["career_role_id"] if goal else 1

        # 2. Fetch top missing skills from required skills
        cur.execute(
            """
            SELECT s.skill_name, s.category, s.importance, s.weight
            FROM career_required_skills s
            WHERE s.career_role_id = %s
              AND LOWER(TRIM(s.skill_name)) NOT IN (
                  SELECT LOWER(TRIM(name)) FROM skills WHERE user_id = %s
              )
            ORDER BY s.weight DESC, s.skill_name ASC;
            """,
            (role_id, user_id)
        )
        missing_skills = cur.fetchall()

        # 3. Fetch incomplete learning milestones
        cur.execute(
            """
            SELECT id, skill_name, category, title
            FROM learning_milestones
            WHERE user_id = %s AND completed IS FALSE
            ORDER BY id ASC
            LIMIT 5;
            """,
            (user_id,)
        )
        pending_milestones = cur.fetchall()

        # 4. Fetch active projects & pending project milestones
        cur.execute(
            """
            SELECT p.id AS project_id, p.title AS project_title, pm.id AS milestone_id, pm.title AS milestone_title
            FROM projects p
            JOIN project_milestones pm ON p.id = pm.project_id
            WHERE p.user_id = %s AND p.status != 'Completed' AND pm.completed IS FALSE
            ORDER BY p.id ASC, pm.order_index ASC
            LIMIT 3;
            """,
            (user_id,)
        )
        project_tasks = cur.fetchall()

        # 5. Fetch curated learning resources
        cur.execute("SELECT skill_name, title, url FROM learning_resources ORDER BY id ASC;")
        resources = cur.fetchall()
        resource_map = {r["skill_name"].lower(): r for r in resources}

        # 6. Upsert daily_plan record
        cur.execute(
            """
            INSERT INTO daily_plans (user_id, plan_date, available_minutes)
            VALUES (%s, CURRENT_DATE, %s)
            ON CONFLICT (user_id, plan_date) DO UPDATE
            SET available_minutes = EXCLUDED.available_minutes, updated_at = NOW()
            RETURNING id, plan_date, available_minutes;
            """,
            (user_id, available_minutes)
        )
        plan = cur.fetchone()
        plan_id = plan["id"]

        # Clear existing pending/skipped tasks if regenerating
        cur.execute(
            "DELETE FROM daily_tasks WHERE daily_plan_id = %s AND status IN ('pending', 'skipped');",
            (plan_id,)
        )

        # Allocate tasks to fit available_minutes
        tasks_to_add = []
        minutes_remaining = available_minutes

        # Priority 1: High-weight skill gap study
        if missing_skills and minutes_remaining >= 25:
            top_gap = missing_skills[0]
            est = min(30, minutes_remaining)
            skill_key = top_gap["skill_name"].lower()
            res_url = resource_map.get(skill_key, {}).get("url")
            tasks_to_add.append({
                "task_type": "skill_study",
                "title": f"Deep Dive: {top_gap['skill_name']} Fundamentals",
                "description": f"Study foundational concepts and syntax for {top_gap['skill_name']} ({top_gap['category']}).",
                "skill_name": top_gap["skill_name"],
                "estimated_minutes": est,
                "reason": f"Top-weight missing skill ({top_gap['weight']} pts) for target role {role_name}",
                "milestone_id": None,
                "project_id": None,
                "resource_url": res_url
            })
            minutes_remaining -= est

        # Priority 2: Incomplete curriculum milestone
        if pending_milestones and minutes_remaining >= 20:
            m = pending_milestones[0]
            est = min(25, minutes_remaining)
            tasks_to_add.append({
                "task_type": "milestone",
                "title": f"Curriculum Milestone: {m['title']}",
                "description": f"Complete hands-on milestone in {m['category']} ({m['skill_name']}).",
                "skill_name": m["skill_name"],
                "estimated_minutes": est,
                "reason": f"Required curriculum milestone for {m['skill_name']} progression",
                "milestone_id": m["id"],
                "project_id": None,
                "resource_url": None
            })
            minutes_remaining -= est

        # Priority 3: Active Project Milestone
        if project_tasks and minutes_remaining >= 20:
            pt = project_tasks[0]
            est = min(30, minutes_remaining)
            tasks_to_add.append({
                "task_type": "project",
                "title": f"Project Build: {pt['milestone_title']}",
                "description": f"Implement {pt['milestone_title']} for your active project '{pt['project_title']}'.",
                "skill_name": "Project Engineering",
                "estimated_minutes": est,
                "reason": f"Direct portfolio evidence for active build '{pt['project_title']}'",
                "milestone_id": None,
                "project_id": pt["project_id"],
                "resource_url": None
            })
            minutes_remaining -= est

        # Priority 4: Secondary skill gap or practical review if time remains
        if missing_skills and len(missing_skills) > 1 and minutes_remaining >= 15:
            sec_gap = missing_skills[1]
            est = minutes_remaining
            sec_res = resource_map.get(sec_gap["skill_name"].lower(), {}).get("url")
            tasks_to_add.append({
                "task_type": "skill_study",
                "title": f"Explore: {sec_gap['skill_name']} Concepts",
                "description": f"Targeted study on {sec_gap['skill_name']} to reinforce core skills.",
                "skill_name": sec_gap["skill_name"],
                "estimated_minutes": est,
                "reason": f"Secondary skill gap ({sec_gap['importance']} priority) for {role_name}",
                "milestone_id": None,
                "project_id": None,
                "resource_url": sec_res
            })
            minutes_remaining -= est
        elif minutes_remaining >= 15:
            tasks_to_add.append({
                "task_type": "dsa",
                "title": "System & Algorithm Practice",
                "description": "Review data structure patterns, algorithm complexity, or system design trade-offs.",
                "skill_name": "Problem Solving",
                "estimated_minutes": minutes_remaining,
                "reason": "Strengthen technical interview problem-solving muscle and code precision",
                "milestone_id": None,
                "project_id": None,
                "resource_url": None
            })

        for t in tasks_to_add:
            cur.execute(
                """
                INSERT INTO daily_tasks 
                (daily_plan_id, user_id, task_type, title, description, skill_name, estimated_minutes, status, reason, milestone_id, project_id, resource_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s, %s);
                """,
                (plan_id, user_id, t["task_type"], t["title"], t["description"], t["skill_name"],
                 t["estimated_minutes"], t["reason"], t["milestone_id"], t["project_id"], t["resource_url"])
            )

        conn.commit()

        # Fetch all tasks for today
        cur.execute(
            """
            SELECT id, task_type, title, description, skill_name, estimated_minutes, status, reason,
                   milestone_id, project_id, resource_url, started_at, completed_at, created_at
            FROM daily_tasks
            WHERE daily_plan_id = %s
            ORDER BY id ASC;
            """,
            (plan_id,)
        )
        all_tasks = cur.fetchall()

    return format_today_plan_response(plan, all_tasks)


def format_today_plan_response(plan_row: Dict[str, Any], tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_tasks = len(tasks)
    completed_tasks = [t for t in tasks if t["status"] == "completed"]
    completed_count = len(completed_tasks)
    progress_percentage = round((completed_count / total_tasks * 100)) if total_tasks > 0 else 0
    total_estimated_minutes = sum(t["estimated_minutes"] for t in tasks)
    completed_study_minutes = sum(t["estimated_minutes"] for t in completed_tasks)
    skills_practiced = sorted(list({t["skill_name"] for t in completed_tasks if t["skill_name"]}))

    return {
        "plan_id": plan_row["id"],
        "plan_date": plan_row["plan_date"].strftime("%Y-%m-%d") if hasattr(plan_row["plan_date"], "strftime") else str(plan_row["plan_date"]),
        "available_minutes": plan_row["available_minutes"],
        "total_tasks": total_tasks,
        "completed_count": completed_count,
        "progress_percentage": progress_percentage,
        "total_estimated_minutes": total_estimated_minutes,
        "completed_study_minutes": completed_study_minutes,
        "skills_practiced": skills_practiced,
        "tasks": tasks
    }


@app.get("/api/today-plan")
def get_today_plan(authorization: Optional[str] = Header(None)):
    """
    Fetches the personalized Today's Plan for the authenticated student.
    Auto-generates plan if not created yet today.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, plan_date, available_minutes
                    FROM daily_plans
                    WHERE user_id = %s AND plan_date = CURRENT_DATE
                    LIMIT 1;
                    """,
                    (user_id,)
                )
                plan = cur.fetchone()

                if not plan:
                    return generate_daily_tasks_for_user(conn, user_id, available_minutes=60)

                cur.execute(
                    """
                    SELECT id, task_type, title, description, skill_name, estimated_minutes, status, reason,
                           milestone_id, project_id, resource_url, started_at, completed_at, created_at
                    FROM daily_tasks
                    WHERE daily_plan_id = %s
                    ORDER BY id ASC;
                    """,
                    (plan["id"],)
                )
                tasks = cur.fetchall()

                if not tasks:
                    return generate_daily_tasks_for_user(conn, user_id, available_minutes=plan["available_minutes"])

                return format_today_plan_response(plan, tasks)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch today's plan: {str(e)}"
        )


@app.post("/api/today-plan/generate")
def regenerate_today_plan(payload: TodayPlanGeneratePayload, authorization: Optional[str] = Header(None)):
    """
    Generates or rebalances Today's Plan based on the selected available study time (30m, 1h, 2h, 3h, custom).
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            return generate_daily_tasks_for_user(conn, user_id, available_minutes=payload.available_minutes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate today's plan: {str(e)}"
        )


@app.put("/api/today-tasks/{task_id}")
def update_today_task(task_id: int, payload: TodayTaskUpdatePayload, authorization: Optional[str] = Header(None)):
    """
    Updates a task's status: 'in_progress', 'completed', 'skipped', or 'pending'.
    Completing a task automatically logs REAL study activity in study_activity_logs,
    marks linked milestones completed, and never fakes skill improvement.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Validate ownership
                cur.execute(
                    """
                    SELECT id, daily_plan_id, task_type, title, skill_name, estimated_minutes, status, milestone_id, project_id
                    FROM daily_tasks
                    WHERE id = %s AND user_id = %s;
                    """,
                    (task_id, user_id)
                )
                task = cur.fetchone()
                if not task:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Daily task with id {task_id} not found"
                    )

                new_status = payload.status
                is_completing = (new_status == "completed" and task["status"] != "completed")
                is_starting = (new_status == "in_progress")

                cur.execute(
                    """
                    UPDATE daily_tasks
                    SET status = %s,
                        started_at = CASE WHEN %s IS TRUE AND started_at IS NULL THEN NOW() ELSE started_at END,
                        completed_at = CASE WHEN %s IS TRUE THEN NOW() WHEN %s = 'pending' THEN NULL ELSE completed_at END
                    WHERE id = %s AND user_id = %s
                    RETURNING id, task_type, title, description, skill_name, estimated_minutes, status, reason,
                              milestone_id, project_id, resource_url, started_at, completed_at;
                    """,
                    (new_status, is_starting or is_completing, is_completing, new_status, task_id, user_id)
                )
                updated_task = cur.fetchone()

                # If completed, update REAL data
                if is_completing:
                    minutes = payload.minutes_spent or task["estimated_minutes"] or 30
                    # 1. Update real study activity log
                    cur.execute(
                        """
                        INSERT INTO study_activity_logs (activity_date, minutes_spent, activities_completed, focus_area, user_id)
                        VALUES (CURRENT_DATE, %s, 1, %s, %s)
                        ON CONFLICT (activity_date, user_id) DO UPDATE
                        SET minutes_spent = study_activity_logs.minutes_spent + EXCLUDED.minutes_spent,
                            activities_completed = study_activity_logs.activities_completed + 1,
                            focus_area = COALESCE(EXCLUDED.focus_area, study_activity_logs.focus_area);
                        """,
                        (minutes, task["title"], user_id)
                    )

                    # 2. Mark linked learning milestone completed if applicable
                    if task["milestone_id"]:
                        cur.execute(
                            """
                            UPDATE learning_milestones
                            SET completed = TRUE, completed_at = NOW()
                            WHERE id = %s AND user_id = %s;
                            """,
                            (task["milestone_id"], user_id)
                        )

                    # 3. Mark linked project milestone completed if applicable
                    if task["project_id"]:
                        cur.execute(
                            """
                            UPDATE project_milestones
                            SET completed = TRUE, completed_at = NOW()
                            WHERE id = (
                                SELECT id FROM project_milestones
                                WHERE project_id = %s AND user_id = %s AND completed IS FALSE
                                ORDER BY order_index ASC LIMIT 1
                            );
                            """,
                            (task["project_id"], user_id)
                        )

                conn.commit()
                return updated_task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update daily task: {str(e)}"
        )


@app.post("/api/today-tasks/{task_id}/replace")
def replace_today_task(task_id: int, authorization: Optional[str] = Header(None)):
    """
    Replaces a pending task with an alternate recommended task based on remaining skill gaps.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, daily_plan_id, skill_name, task_type FROM daily_tasks WHERE id = %s AND user_id = %s;", (task_id, user_id))
                task = cur.fetchone()
                if not task:
                    raise HTTPException(status_code=404, detail="Task not found")

                # Find alternative missing skill
                cur.execute(
                    """
                    SELECT s.skill_name, s.category, s.importance, s.weight
                    FROM career_required_skills s
                    JOIN student_career_goals g ON s.career_role_id = g.career_role_id
                    WHERE g.user_id = %s
                      AND LOWER(TRIM(s.skill_name)) NOT IN (
                          SELECT LOWER(TRIM(skill_name)) FROM daily_tasks WHERE daily_plan_id = %s
                      )
                    ORDER BY s.weight DESC
                    LIMIT 1;
                    """,
                    (user_id, task["daily_plan_id"])
                )
                alt = cur.fetchone()
                if alt:
                    new_title = f"Skill Mastery: {alt['skill_name']} Lab"
                    new_desc = f"Focused deep dive on {alt['skill_name']} ({alt['category']})."
                    new_reason = f"Alternative high-priority gap ({alt['weight']} pts) for career roadmap"
                    new_skill = alt["skill_name"]
                else:
                    new_title = "Data Structures & Code Review"
                    new_desc = "Analyze algorithm efficiency, time complexities, and clean code practices."
                    new_reason = "Reinforce core engineering foundations"
                    new_skill = "Computer Science"

                cur.execute(
                    """
                    UPDATE daily_tasks
                    SET title = %s, description = %s, skill_name = %s, reason = %s, status = 'pending', started_at = NULL, completed_at = NULL
                    WHERE id = %s
                    RETURNING id, task_type, title, description, skill_name, estimated_minutes, status, reason;
                    """,
                    (new_title, new_desc, new_skill, new_reason, task_id)
                )
                replaced = cur.fetchone()
                conn.commit()
                return replaced
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to replace task: {str(e)}")


# ==============================================================================
# PHASE 9: CAREER SKILL ASSESSMENT ENDPOINTS
# ==============================================================================

class AssessmentAnswerSubmission(BaseModel):
    question_id: int
    selected_answer: str
    confidence: Optional[str] = "Medium"


class AssessmentSubmitPayload(BaseModel):
    role_id: int
    confidence_rating: str = Field(default="Medium", pattern="^(Low|Medium|High)$")
    answers: List[AssessmentAnswerSubmission]


@app.get("/api/assessments/questions")
def get_assessment_questions(role_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """
    Returns curated practical assessment questions for the selected career role.
    Hides correct_answer and explanation to ensure quiz integrity.
    """
    _ = resolve_user(authorization)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                target_role = role_id
                if not target_role:
                    cur.execute("SELECT id FROM career_roles ORDER BY id ASC LIMIT 1;")
                    r = cur.fetchone()
                    target_role = r["id"] if r else 1

                cur.execute(
                    """
                    SELECT id, career_role_id, skill_name, question_type, question_text,
                           code_snippet, options, difficulty
                    FROM assessments
                    WHERE career_role_id = %s OR career_role_id IS NULL
                    ORDER BY id ASC;
                    """,
                    (target_role,)
                )
                questions = cur.fetchall()
                if not questions:
                    # Fallback to all questions
                    cur.execute(
                        """
                        SELECT id, career_role_id, skill_name, question_type, question_text,
                               code_snippet, options, difficulty
                        FROM assessments
                        ORDER BY id ASC;
                        """
                    )
                    questions = cur.fetchall()

                return {
                    "role_id": target_role,
                    "total_questions": len(questions),
                    "questions": questions
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch assessment questions: {str(e)}")


@app.post("/api/assessments/submit")
def submit_career_assessment(payload: AssessmentSubmitPayload, authorization: Optional[str] = Header(None)):
    """
    Evaluates practical assessment submissions, calculates score %,
    determines estimated level (Beginner/Intermediate/Advanced), records student confidence,
    and stores attempt history without overwriting previous attempts.
    """
    user = resolve_user(authorization)
    user_id = user["id"]

    if not payload.answers:
        raise HTTPException(status_code=400, detail="Submission must contain at least one answer")

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Fetch questions with answers
                q_ids = [a.question_id for a in payload.answers]
                cur.execute(
                    """
                    SELECT id, skill_name, correct_answer, explanation
                    FROM assessments
                    WHERE id = ANY(%s);
                    """,
                    (q_ids,)
                )
                q_data = {r["id"]: r for r in cur.fetchall()}

                correct_count = 0
                skill_stats = {}
                evaluated_answers = []

                for ans in payload.answers:
                    q = q_data.get(ans.question_id)
                    if not q:
                        continue
                    skill = q["skill_name"]
                    is_correct = (ans.selected_answer.strip().lower() == q["correct_answer"].strip().lower())
                    if is_correct:
                        correct_count += 1

                    if skill not in skill_stats:
                        skill_stats[skill] = {"total": 0, "correct": 0}
                    skill_stats[skill]["total"] += 1
                    if is_correct:
                        skill_stats[skill]["correct"] += 1

                    evaluated_answers.append({
                        "question_id": ans.question_id,
                        "selected_answer": ans.selected_answer,
                        "correct_answer": q["correct_answer"],
                        "is_correct": is_correct,
                        "explanation": q["explanation"]
                    })

                total_questions = len(payload.answers)
                score_pct = round((correct_count / total_questions * 100), 1) if total_questions else 0.0

                if score_pct >= 80.0:
                    estimated_level = "Advanced"
                elif score_pct >= 50.0:
                    estimated_level = "Intermediate"
                else:
                    estimated_level = "Beginner"

                # Calculate skill breakdown
                skill_breakdown = {}
                for sk, counts in skill_stats.items():
                    pct = round((counts["correct"] / counts["total"] * 100), 1) if counts["total"] else 0.0
                    skill_breakdown[sk] = {
                        "total": counts["total"],
                        "correct": counts["correct"],
                        "score_percentage": pct
                    }

                # Store attempt in assessment_attempts
                import json
                cur.execute(
                    """
                    INSERT INTO assessment_attempts 
                    (user_id, career_role_id, score_percentage, estimated_level, confidence_rating,
                     total_questions, correct_count, skill_breakdown, answers_payload)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    RETURNING id, score_percentage, estimated_level, confidence_rating, total_questions, correct_count, attempt_date;
                    """,
                    (user_id, payload.role_id, score_pct, estimated_level, payload.confidence_rating,
                     total_questions, correct_count, json.dumps(skill_breakdown), json.dumps(evaluated_answers))
                )
                attempt = cur.fetchone()
                conn.commit()

                return {
                    "attempt_id": attempt["id"],
                    "score_percentage": float(attempt["score_percentage"]),
                    "estimated_level": attempt["estimated_level"],
                    "confidence_rating": attempt["confidence_rating"],
                    "correct_count": attempt["correct_count"],
                    "total_questions": attempt["total_questions"],
                    "skill_breakdown": skill_breakdown,
                    "attempt_date": attempt["attempt_date"].strftime("%Y-%m-%d %H:%M:%S") if attempt["attempt_date"] else None,
                    "evaluated_answers": evaluated_answers
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to evaluate assessment: {str(e)}")


@app.get("/api/assessments/history")
def get_assessment_history(role_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """
    Returns historical assessment attempts for the authenticated student.
    Returns empty list if no data exists ('Not enough data yet').
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if role_id:
                    cur.execute(
                        """
                        SELECT a.id, a.career_role_id, r.name AS role_name, a.score_percentage,
                               a.estimated_level, a.confidence_rating, a.total_questions, a.correct_count,
                               a.skill_breakdown, a.attempt_date
                        FROM assessment_attempts a
                        LEFT JOIN career_roles r ON a.career_role_id = r.id
                        WHERE a.user_id = %s AND a.career_role_id = %s
                        ORDER BY a.attempt_date DESC;
                        """,
                        (user_id, role_id)
                    )
                else:
                    cur.execute(
                        """
                        SELECT a.id, a.career_role_id, r.name AS role_name, a.score_percentage,
                               a.estimated_level, a.confidence_rating, a.total_questions, a.correct_count,
                               a.skill_breakdown, a.attempt_date
                        FROM assessment_attempts a
                        LEFT JOIN career_roles r ON a.career_role_id = r.id
                        WHERE a.user_id = %s
                        ORDER BY a.attempt_date DESC;
                        """,
                        (user_id,)
                    )
                rows = cur.fetchall()
                for r in rows:
                    r["score_percentage"] = float(r["score_percentage"])
                    if r["attempt_date"]:
                        r["attempt_date"] = r["attempt_date"].strftime("%Y-%m-%d %H:%M:%S")
                return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch assessment history: {str(e)}")


# ==============================================================================
# PHASE 10: EVIDENCE-BASED SKILL PROFILE ENDPOINTS
# ==============================================================================

@app.get("/api/skills/evidence")
def get_skills_evidence(authorization: Optional[str] = Header(None)):
    """
    Computes evidence-backed skill profiles for all verified student skills.
    Incorporates:
    - self-reported level
    - practical assessment score
    - completed milestones count
    - related projects count
    - study hours logged
    - evidence confidence (Low / Medium / High) with plain-English explanation
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. User's skills
                cur.execute("SELECT id, name, category, level FROM skills WHERE user_id = %s ORDER BY name ASC;", (user_id,))
                skills = cur.fetchall()

                # 2. Latest assessment attempts
                cur.execute(
                    """
                    SELECT skill_breakdown
                    FROM assessment_attempts
                    WHERE user_id = %s
                    ORDER BY attempt_date DESC LIMIT 5;
                    """,
                    (user_id,)
                )
                attempts = cur.fetchall()
                skill_assessment_scores = {}
                for att in attempts:
                    breakdown = att.get("skill_breakdown") or {}
                    for sk_name, data in breakdown.items():
                        key = sk_name.lower().strip()
                        if key not in skill_assessment_scores and "score_percentage" in data:
                            skill_assessment_scores[key] = data["score_percentage"]

                # 3. Learning milestones per skill
                cur.execute(
                    """
                    SELECT LOWER(TRIM(skill_name)) as sk_key,
                           COUNT(*) AS total_m,
                           COUNT(*) FILTER (WHERE completed IS TRUE) AS completed_m
                    FROM learning_milestones
                    WHERE user_id = %s
                    GROUP BY LOWER(TRIM(skill_name));
                    """,
                    (user_id,)
                )
                milestone_map = {row["sk_key"]: row for row in cur.fetchall()}

                # 4. Projects per skill
                cur.execute("SELECT id, title, target_skills FROM projects WHERE user_id = %s;", (user_id,))
                user_projects = cur.fetchall()

                # 5. Study logs
                cur.execute("SELECT minutes_spent, focus_area FROM study_activity_logs WHERE user_id = %s;", (user_id,))
                study_logs = cur.fetchall()

        evidence_list = []
        for s in skills:
            s_name = s["name"]
            s_key = s_name.lower().strip()

            # Assessment score
            score = skill_assessment_scores.get(s_key)

            # Milestones
            m_stat = milestone_map.get(s_key, {"total_m": 0, "completed_m": 0})
            comp_m = m_stat["completed_m"]
            tot_m = m_stat["total_m"]

            # Projects
            matched_prjs = []
            for p in user_projects:
                target_sk = [t.lower().strip() for t in (p["target_skills"] or [])]
                if s_key in target_sk or any(s_key in t for t in target_sk):
                    matched_prjs.append(p["title"])
            prj_count = len(matched_prjs)

            # Study hours
            study_mins = 0
            for l in study_logs:
                fa = (l["focus_area"] or "").lower()
                if s_key in fa:
                    study_mins += l["minutes_spent"]
            study_hrs = round(study_mins / 60.0, 1)

            # Confidence calculation & reason
            has_high_score = (score is not None and score >= 70.0)
            has_medium_score = (score is not None and score >= 40.0)

            if has_high_score and (prj_count >= 1 or study_hrs >= 8.0 or comp_m >= 3):
                confidence = "High"
                reason = f"High: Verified by assessment ({score}%), {prj_count} portfolio project(s), and {study_hrs}h of documented study."
            elif has_medium_score or prj_count >= 1 or comp_m >= 3 or study_hrs >= 4.0:
                confidence = "Medium"
                reasons = []
                if score is not None:
                    reasons.append(f"assessment ({score}%)")
                if prj_count > 0:
                    reasons.append(f"{prj_count} linked project(s)")
                if comp_m > 0:
                    reasons.append(f"{comp_m} completed milestone(s)")
                if study_hrs > 0:
                    reasons.append(f"{study_hrs}h study")
                reason = f"Medium: Supported by {', '.join(reasons)}. Take further assessments or add projects to strengthen."
            else:
                confidence = "Low"
                reason = "Low: Self-reported level. Not yet verified by assessment, portfolio project code, or substantial study hours."

            evidence_list.append({
                "skill_id": s["id"],
                "skill_name": s_name,
                "category": s["category"],
                "self_reported_level": s["level"],
                "assessment_score": score,
                "completed_milestones": comp_m,
                "total_milestones": tot_m,
                "milestones_display": f"{comp_m}/{tot_m}" if tot_m > 0 else "0/0",
                "related_projects_count": prj_count,
                "related_projects": matched_prjs,
                "study_hours": study_hrs,
                "evidence_confidence": confidence,
                "confidence_reason": reason,
                "disclaimer": "Progress Confidence reflects documented learning milestones, projects, and assessments. It does not claim absolute job ability."
            })

        return evidence_list
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate skill evidence: {str(e)}")


@app.get("/api/skills/{skill_id}/evidence")
def get_single_skill_evidence(skill_id: int, authorization: Optional[str] = Header(None)):
    """Fetches evidence profile for a specific skill."""
    all_evidence = get_skills_evidence(authorization=authorization)
    for e in all_evidence:
        if e["skill_id"] == skill_id:
            return e
    raise HTTPException(status_code=404, detail="Skill not found")


# ==============================================================================
# PHASE 11: PROJECT-BASED LEARNING HUB ENDPOINTS
# ==============================================================================

class ProjectMilestonePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    completed: bool = False


class ProjectCreatePayload(BaseModel):
    career_role_id: Optional[int] = None
    title: str = Field(..., min_length=2, max_length=255)
    description: str = Field(..., min_length=5)
    target_skills: List[str] = []
    difficulty: str = Field(default="Intermediate", pattern="^(Beginner|Intermediate|Advanced)$")
    estimated_hours: float = Field(default=20.0, ge=1.0, le=500.0)
    status: str = Field(default="In Progress", pattern="^(Planning|In Progress|Completed|Under Review)$")
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    github_url: Optional[str] = None
    notes: Optional[str] = None
    milestones: Optional[List[ProjectMilestonePayload]] = []


class ProjectUpdatePayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_skills: Optional[List[str]] = None
    difficulty: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    github_url: Optional[str] = None
    notes: Optional[str] = None


class MilestoneTogglePayload(BaseModel):
    completed: bool


@app.get("/api/projects")
def get_user_projects(authorization: Optional[str] = Header(None)):
    """
    Fetches all projects and their step-by-step milestones for the authenticated student.
    Calculates milestone completion percentage.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, user_id, career_role_id, title, description, target_skills,
                           difficulty, estimated_hours, status, start_date, target_date,
                           github_url, notes, created_at, updated_at
                    FROM projects
                    WHERE user_id = %s
                    ORDER BY id DESC;
                    """,
                    (user_id,)
                )
                projects = cur.fetchall()

                # Fetch milestones for all projects
                cur.execute(
                    """
                    SELECT id, project_id, title, completed, completed_at, order_index
                    FROM project_milestones
                    WHERE user_id = %s
                    ORDER BY project_id ASC, order_index ASC;
                    """,
                    (user_id,)
                )
                milestones = cur.fetchall()

        # Group milestones by project_id
        m_grouped = {}
        for m in milestones:
            p_id = m["project_id"]
            if p_id not in m_grouped:
                m_grouped[p_id] = []
            m_grouped[p_id].append({
                "id": m["id"],
                "title": m["title"],
                "completed": m["completed"],
                "completed_at": m["completed_at"].strftime("%Y-%m-%d %H:%M:%S") if m["completed_at"] else None,
                "order_index": m["order_index"]
            })

        result = []
        for p in projects:
            p_ms = m_grouped.get(p["id"], [])
            total_m = len(p_ms)
            comp_m = sum(1 for m in p_ms if m["completed"])
            pct = round((comp_m / total_m * 100)) if total_m > 0 else (100 if p["status"] == "Completed" else 0)

            result.append({
                "id": p["id"],
                "career_role_id": p["career_role_id"],
                "title": p["title"],
                "description": p["description"],
                "target_skills": p["target_skills"] or [],
                "difficulty": p["difficulty"],
                "estimated_hours": float(p["estimated_hours"]),
                "status": p["status"],
                "progress_percentage": pct,
                "start_date": p["start_date"].strftime("%Y-%m-%d") if p["start_date"] else None,
                "target_date": p["target_date"].strftime("%Y-%m-%d") if p["target_date"] else None,
                "github_url": p["github_url"],
                "notes": p["notes"],
                "milestones": p_ms
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")


@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_user_project(payload: ProjectCreatePayload, authorization: Optional[str] = Header(None)):
    """Creates a new project with step-by-step milestones for the authenticated student."""
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO projects 
                    (user_id, career_role_id, title, description, target_skills, difficulty,
                     estimated_hours, status, start_date, target_date, github_url, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, description, target_skills, difficulty, estimated_hours, status;
                    """,
                    (
                        user_id, payload.career_role_id, payload.title, payload.description,
                        payload.target_skills, payload.difficulty, payload.estimated_hours,
                        payload.status, payload.start_date, payload.target_date,
                        payload.github_url, payload.notes
                    )
                )
                created = cur.fetchone()
                p_id = created["id"]

                created_milestones = []
                if payload.milestones:
                    for idx, m in enumerate(payload.milestones):
                        cur.execute(
                            """
                            INSERT INTO project_milestones (project_id, user_id, title, completed, order_index)
                            VALUES (%s, %s, %s, %s, %s)
                            RETURNING id, title, completed, order_index;
                            """,
                            (p_id, user_id, m.title, m.completed, idx)
                        )
                        created_milestones.append(cur.fetchone())

                conn.commit()
                created["milestones"] = created_milestones
                created["progress_percentage"] = 0
                return created
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


@app.put("/api/projects/{project_id}")
def update_user_project(project_id: int, payload: ProjectUpdatePayload, authorization: Optional[str] = Header(None)):
    """Updates project metadata, status, or GitHub repository URL."""
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE projects
                    SET title = COALESCE(%s, title),
                        description = COALESCE(%s, description),
                        target_skills = COALESCE(%s, target_skills),
                        difficulty = COALESCE(%s, difficulty),
                        estimated_hours = COALESCE(%s, estimated_hours),
                        status = COALESCE(%s, status),
                        github_url = COALESCE(%s, github_url),
                        notes = COALESCE(%s, notes),
                        updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    RETURNING id, title, description, target_skills, difficulty, estimated_hours, status, github_url, notes;
                    """,
                    (payload.title, payload.description, payload.target_skills, payload.difficulty,
                     payload.estimated_hours, payload.status, payload.github_url, payload.notes,
                     project_id, user_id)
                )
                updated = cur.fetchone()
                if not updated:
                    raise HTTPException(status_code=404, detail="Project not found")
                conn.commit()
                return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")


@app.delete("/api/projects/{project_id}")
def delete_user_project(project_id: int, authorization: Optional[str] = Header(None)):
    """Deletes a project and its milestones."""
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM projects WHERE id = %s AND user_id = %s RETURNING id;", (project_id, user_id))
                deleted = cur.fetchone()
                if not deleted:
                    raise HTTPException(status_code=404, detail="Project not found")
                conn.commit()
                return {"message": "Project removed successfully", "id": project_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")


@app.put("/api/projects/{project_id}/milestones/{milestone_id}")
def toggle_project_milestone(project_id: int, milestone_id: int, payload: MilestoneTogglePayload, authorization: Optional[str] = Header(None)):
    """Toggles completion of an individual project milestone."""
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE project_milestones
                    SET completed = %s,
                        completed_at = CASE WHEN %s IS TRUE THEN NOW() ELSE NULL END
                    WHERE id = %s AND project_id = %s AND user_id = %s
                    RETURNING id, project_id, title, completed, completed_at;
                    """,
                    (payload.completed, payload.completed, milestone_id, project_id, user_id)
                )
                updated = cur.fetchone()
                if not updated:
                    raise HTTPException(status_code=404, detail="Project milestone not found")
                conn.commit()
                return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle milestone: {str(e)}")


@app.post("/api/projects/ai-generate")
def ai_generate_project(authorization: Optional[str] = Header(None)):
    """
    AI Project Generator: Creates a structured project blueprint grounded in the student's
    actual missing skills and active career goal.
    Requires student confirmation before saving into PostgreSQL.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    check_ai_rate_limit(f"user_{user_id}")
    try:
        gap = get_career_gap_analysis(authorization=authorization)
        roadmap = get_learning_roadmap(authorization=authorization)
        study = get_study_activity(authorization=authorization)

        with get_db_connection() as conn:
            student_context = build_student_ai_context(
                conn,
                gap_info=gap,
                roadmap_info=roadmap,
                study_info=study,
                user_id=user_id
            )

        draft = generate_ai_project_draft(student_context)
        return draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI project blueprint: {str(e)}")


# ==============================================================================
# PHASE 12: CAREER PREPARATION DASHBOARD ENDPOINTS
# ==============================================================================

@app.get("/api/career-preparation")
def get_career_preparation(authorization: Optional[str] = Header(None)):
    """
    Computes Career Preparation Progress across 6 verifiable pillars:
    1. Skill Development (Gap analysis readiness %)
    2. Learning Progress (Curriculum milestone completion %)
    3. Project Evidence (Portfolio project milestones %)
    4. DSA Practice (Algorithmic & Problem Solving questions/milestones)
    5. Git/GitHub (Projects with repository URLs attached)
    6. Resume Evidence (Skills with High/Medium evidence confidence)

    Also generates genuine, non-fabricated:
    - WHAT IS GOING WELL
    - WHAT NEEDS ATTENTION
    - NEXT RECOMMENDED ACTION

    Explicitly explains the metric and disclaims job guarantees.
    """
    user = resolve_user(authorization)
    user_id = user["id"]
    try:
        # 1. Skill Development
        gap = get_career_gap_analysis(authorization=authorization)
        skill_dev_pct = gap.get("readiness_percentage", 0)

        # 2. Learning Progress
        milestones = get_learning_milestones(authorization=authorization)
        total_m = len(milestones)
        comp_m = sum(1 for m in milestones if m["completed"])
        learning_progress_pct = round((comp_m / total_m * 100)) if total_m > 0 else 0

        # 3. Project Evidence & 5. Git/GitHub
        projects = get_user_projects(authorization=authorization)
        total_prjs = len(projects)
        if total_prjs > 0:
            avg_prj_progress = round(sum(p["progress_percentage"] for p in projects) / total_prjs)
            github_count = sum(1 for p in projects if p.get("github_url"))
            git_github_pct = round((github_count / total_prjs * 100))
        else:
            avg_prj_progress = 0
            git_github_pct = 0

        # 4. DSA Practice
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) as total_dsa,
                           COUNT(*) FILTER (WHERE completed IS TRUE) as comp_dsa
                    FROM learning_milestones
                    WHERE user_id = %s AND (LOWER(category) LIKE '%%core%%' OR LOWER(category) LIKE '%%dsa%%' OR LOWER(title) LIKE '%%data structure%%' OR LOWER(title) LIKE '%%algorithm%%');
                    """,
                    (user_id,)
                )
                dsa_row = cur.fetchone()
                tot_dsa = dsa_row["total_dsa"]
                comp_dsa = dsa_row["comp_dsa"]
                dsa_pct = round((comp_dsa / tot_dsa * 100)) if tot_dsa > 0 else 25

        # 6. Resume Evidence
        evidence = get_skills_evidence(authorization=authorization)
        tot_skills = len(evidence)
        verified_skills = sum(1 for e in evidence if e["evidence_confidence"] in ("High", "Medium"))
        resume_evidence_pct = round((verified_skills / tot_skills * 100)) if tot_skills > 0 else 0

        # Composite score
        pillars = {
            "skill_development": skill_dev_pct,
            "learning_progress": learning_progress_pct,
            "project_evidence": avg_prj_progress,
            "dsa_practice": dsa_pct,
            "git_github": git_github_pct,
            "resume_evidence": resume_evidence_pct
        }

        # Weighted calculation
        overall_percentage = round(
            skill_dev_pct * 0.25 +
            learning_progress_pct * 0.20 +
            avg_prj_progress * 0.20 +
            dsa_pct * 0.15 +
            git_github_pct * 0.10 +
            resume_evidence_pct * 0.10
        )

        # Dynamic What is Going Well
        going_well = []
        study = get_study_activity(authorization=authorization)
        streak = study.get("current_streak_days", 0)
        hours = study.get("total_hours", 0.0)

        if streak >= 3:
            going_well.append(f"Strong consistency: Active {streak}-day daily study streak with {hours}h logged.")
        elif hours >= 5.0:
            going_well.append(f"Solid study dedication: {hours} hours of focused study activity recorded.")
        else:
            going_well.append("Account initialized and target career milestones actively mapped.")

        if comp_m > 0:
            going_well.append(f"Completed {comp_m} verified curriculum learning milestones.")

        if total_prjs > 0 and avg_prj_progress >= 40:
            going_well.append(f"Active portfolio development: '{projects[0]['title']}' is {projects[0]['progress_percentage']}% completed.")

        # Dynamic What Needs Attention
        needs_attention = []
        missing = gap.get("missing_skills", [])
        if missing:
            top_missing = missing[0]["skill_name"]
            needs_attention.append(f"High-weight gap in target role: {top_missing} ({missing[0]['weight']} pts).")

        if git_github_pct < 50:
            needs_attention.append("Public code evidence: Connect GitHub repository links to active projects.")

        if total_prjs == 0:
            needs_attention.append("No portfolio projects yet: Build a project to demonstrate practical skill application.")

        # Dynamic Next Recommended Action
        if missing:
            next_action = f"Complete today's task for '{missing[0]['skill_name']}' or take the Career Skill Assessment."
        elif total_prjs > 0 and avg_prj_progress < 100:
            next_action = f"Finish the next milestone for '{projects[0]['title']}'."
        else:
            next_action = "Take the initial Career Skill Assessment to verify existing skill masteries."

        return {
            "career_role_id": gap.get("role_id"),
            "role_name": gap.get("role_name"),
            "overall_preparation_percentage": overall_percentage,
            "metric_title": "Career Preparation Progress",
            "calculation_explanation": (
                "Calculated as a composite average of Skill Development (25%), Learning Progress (20%), "
                "Project Evidence (20%), DSA Practice (15%), Git/GitHub (10%), and Resume Evidence (10%). "
                "This metric represents verifiable progress and does not constitute a job guarantee."
            ),
            "pillars": {
                "skill_development": {
                    "title": "Skill Development",
                    "percentage": skill_dev_pct,
                    "description": f"{gap.get('matched_count', 0)} of {gap.get('total_skills_required', 0)} required role competencies matched"
                },
                "learning_progress": {
                    "title": "Learning Progress",
                    "percentage": learning_progress_pct,
                    "description": f"{comp_m} of {total_m} curriculum milestones completed"
                },
                "project_evidence": {
                    "title": "Project Evidence",
                    "percentage": avg_prj_progress,
                    "description": f"{total_prjs} active projects ({avg_prj_progress}% average milestone completion)"
                },
                "dsa_practice": {
                    "title": "DSA Practice",
                    "percentage": dsa_pct,
                    "description": f"{comp_dsa} core problem-solving modules completed"
                },
                "git_github": {
                    "title": "Git/GitHub",
                    "percentage": git_github_pct,
                    "description": f"{git_github_pct}% of projects linked with public repositories"
                },
                "resume_evidence": {
                    "title": "Resume Evidence",
                    "percentage": resume_evidence_pct,
                    "description": f"{verified_skills} of {tot_skills} skills backed by assessment or project proof"
                }
            },
            "what_is_going_well": going_well,
            "what_needs_attention": needs_attention,
            "next_recommended_action": next_action
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute career preparation: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)