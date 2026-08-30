from fastapi import APIRouter, HTTPException

from app.auth import create_access_token, hash_password, verify_password
from app.database import get_connection
from app.schemas import EnterpriseRegister, Login, StaffRegister, Token, VendorRegister

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register/vendor", response_model=Token)
def register_vendor(body: VendorRegister):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM `user` WHERE email = %s", (body.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")

            cur.execute(
                "INSERT INTO `user` (name, email, password_hash, role) VALUES (%s, %s, %s, 'vendor')",
                (body.name, body.email, hash_password(body.password)),
            )
            user_id = cur.lastrowid
            cur.execute(
                "INSERT INTO vendor (user_id, company_name, address) VALUES (%s, %s, %s)",
                (user_id, body.company_name, body.address),
            )
        token = create_access_token({"user_id": user_id})
        return Token(access_token=token, role="vendor", name=body.name)
    finally:
        conn.close()


@router.post("/register/enterprise", response_model=Token)
def register_enterprise(body: EnterpriseRegister):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM `user` WHERE email = %s", (body.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")

            cur.execute(
                "INSERT INTO `user` (name, email, password_hash, role) VALUES (%s, %s, %s, 'enterprise')",
                (body.name, body.email, hash_password(body.password)),
            )
            user_id = cur.lastrowid
            cur.execute(
                "INSERT INTO enterprise (user_id, company_name, address) VALUES (%s, %s, %s)",
                (user_id, body.company_name, body.address),
            )
        token = create_access_token({"user_id": user_id})
        return Token(access_token=token, role="enterprise", name=body.name)
    finally:
        conn.close()


@router.post("/register/staff", response_model=Token)
def register_staff(body: StaffRegister):
    """Warehouse staff / admin signup. In a real deployment this would be
    invite-only; kept open here so the prototype is demoable end-to-end."""
    if body.role not in ("warehouse_staff", "admin"):
        raise HTTPException(status_code=400, detail="role must be warehouse_staff or admin")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM `user` WHERE email = %s", (body.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")
            cur.execute(
                "INSERT INTO `user` (name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
                (body.name, body.email, hash_password(body.password), body.role),
            )
            user_id = cur.lastrowid
        token = create_access_token({"user_id": user_id})
        return Token(access_token=token, role=body.role, name=body.name)
    finally:
        conn.close()


@router.post("/login", response_model=Token)
def login(body: Login):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, password_hash, role FROM `user` WHERE email = %s",
                (body.email,),
            )
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"user_id": user["id"]})
    return Token(access_token=token, role=user["role"], name=user["name"])
