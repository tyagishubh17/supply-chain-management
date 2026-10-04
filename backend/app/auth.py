"""Authentication and role-based authorisation.

Two roles only: vendor and customer. Each lives in its own table, so the
JWT carries both the row id and which table it refers to. A vendor token
can never satisfy a customer-only endpoint and vice versa.

Passwords are hashed with bcrypt; the plaintext is never stored or logged.
The signing secret comes from the environment, never from source.
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import fetch_one

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is not set. Copy backend/.env.example to backend/.env "
        "and set a long random value."
    )

JWT_ALGORITHM = "HS256"

# Keep access tokens short-lived; override the default through the environment.
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "12"))

bearer_scheme = HTTPBearer(auto_error=False)

# Per role: the table, its primary key, and the column holding the
# display name. Keeps the two roles from needing duplicated SQL.
ROLE_TABLES = {
    "vendor": ("vendors", "vendor_id", "company_name"),
    "customer": ("customers", "customer_id", "full_name"),
}


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt before storing it."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        # Stored value is not a valid bcrypt hash (e.g. hand-inserted row).
        return False





def create_access_token(user_id: int, role: str) -> str:
    # Store both identity and role in the signed token so authorization
    # checks do not depend on user-supplied identity fields.
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.now(timezone.utc)
        + timedelta(hours=TOKEN_TTL_HOURS),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Resolve the bearer token to a real row in vendors or customers.

    The identity comes from the signed token only. No endpoint accepts a
    user id from the URL or body, which is what stops one account reading
    another account's data by changing an id.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise invalid

    try:
        payload = jwt.decode(
            creds.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = int(payload["sub"])
        role = payload["role"]
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise invalid from None


    # Reject unknown roles before constructing the database query.

    if role not in ROLE_TABLES:
        raise invalid

    table, pk, name_col = ROLE_TABLES[role]


    # Resolve the token identity against the database so deleted or
    # nonexistent accounts cannot authenticate successfully.

    row = fetch_one(
        f"SELECT {pk} AS id, {name_col} AS name, email FROM {table} WHERE {pk} = %s",
        (user_id,),
    )
    if row is None:
        raise invalid

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": role,
    }



def require_role(role: str):
    """Dependency factory: only the named role may call the endpoint."""

    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action is only available to a {role} account.",
            )
        return user

    return checker


require_vendor = require_role("vendor")
require_customer = require_role("customer")
