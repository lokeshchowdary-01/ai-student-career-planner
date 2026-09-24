import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Depends, status, Response
import psycopg
from psycopg.rows import dict_row
import bcrypt

SESSION_DURATION_DAYS = 7
SESSION_COOKIE_NAME = "learnorbit_session"
SESSION_COOKIE_MAX_AGE = SESSION_DURATION_DAYS * 86400


def set_session_cookie(response: Response, token: str, is_production: bool = False) -> None:
    """Sets a secure HttpOnly session cookie on the HTTP response."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=is_production,
        path="/"
    )


def clear_session_cookie(response: Response) -> None:
    """Deletes the HttpOnly session cookie on the HTTP response."""
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with a salt."""
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_user_session(conn, user_id: int) -> str:
    """Generates a secure 64-char hex session token and persists it with expiration."""
    token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_sessions (token, user_id, expires_at)
            VALUES (%s, %s, %s);
            """,
            (token, user_id, expires_at)
        )
    conn.commit()
    return token


def get_user_from_token(conn, token: str) -> Optional[Dict[str, Any]]:
    """Retrieves the active user record matching an unexpired session token."""
    if not token:
        return None

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.name, u.email, u.created_at, s.expires_at
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = %s;
            """,
            (token,)
        )
        row = cur.fetchone()

    if not row:
        return None

    # Check expiration
    expires_at = row["expires_at"]
    if expires_at and expires_at < datetime.now(timezone.utc):
        revoke_session(conn, token)
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "created_at": row["created_at"]
    }


def revoke_session(conn, token: str) -> bool:
    """Revokes / deletes a session token upon logout."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM user_sessions WHERE token = %s;", (token,))
    conn.commit()
    return True
