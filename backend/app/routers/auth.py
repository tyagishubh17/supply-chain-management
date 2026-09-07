"""Register / login for the two roles. Logout is client-side: the token
is simply discarded, since it carries its own expiry and no server session
is kept."""

import psycopg
from fastapi import APIRouter, HTTPException

from app.auth import create_access_token, hash_password, verify_password
from app.database import fetch_one, get_cursor
from app.schemas import CustomerRegister, Login, Session, VendorRegister

router = APIRouter(prefix="/auth", tags=["auth"])


def _register(table: str, pk: str, name_col: str, name: str, email: str,
              password: str, role: str) -> Session:
    """Insert the account and hand back a token.

    Uniqueness is not pre-checked with a SELECT: the UNIQUE constraint and
    the cross-role trigger are the authority, and relying on them avoids a
    race where two simultaneous registrations both see a free email.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO {table} ({name_col}, email, password_hash) "
                f"VALUES (%s, %s, %s) RETURNING {pk} AS id",
                (name.strip(), email.lower(), hash_password(password)),
            )
            user_id = cur.fetchone()["id"]
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="That email is already registered.") from None
    except psycopg.errors.RaiseException as exc:
        # The cross-role trigger fires when the email exists under the other role.
        raise HTTPException(status_code=409, detail=exc.diag.message_primary) from None

    return Session(access_token=create_access_token(user_id, role), role=role, name=name.strip())


@router.post("/register/vendor", response_model=Session, status_code=201)
def register_vendor(body: VendorRegister):
    return _register("vendors", "vendor_id", "company_name",
                     body.company_name, body.email, body.password, "vendor")


@router.post("/register/customer", response_model=Session, status_code=201)
def register_customer(body: CustomerRegister):
    return _register("customers", "customer_id", "full_name",
                     body.full_name, body.email, body.password, "customer")


@router.post("/login", response_model=Session)
def login(body: Login):
    table, pk, name_col = (
        ("vendors", "vendor_id", "company_name")
        if body.role == "vendor"
        else ("customers", "customer_id", "full_name")
    )
    row = fetch_one(
        f"SELECT {pk} AS id, {name_col} AS name, password_hash FROM {table} WHERE email = %s",
        (body.email.lower(),),
    )

    # One message for both a missing account and a wrong password, so the
    # response cannot be used to discover which emails are registered.
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return Session(
        access_token=create_access_token(row["id"], body.role),
        role=body.role,
        name=row["name"],
    )
