"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_cursor, pool
from app.routers import auth, orders, products, sales

load_dotenv()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Open the connection pool on start-up and close it on shutdown.

    pool.wait() fails fast with a clear error if DATABASE_URL is wrong,
    instead of letting the first request return something confusing.
    """
    pool.open()
    pool.wait(timeout=20)
    yield
    pool.close()


app = FastAPI(
    title="Multi-Vendor Supply Chain Management API",
    description="Vendor and customer API over a Supabase PostgreSQL database.",
    version="1.0.0",
    lifespan=lifespan,
)

# Only the dev frontend is allowed by default. Override with a
# comma-separated CORS_ORIGINS in .env when deploying.
origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(sales.router)


@app.get("/health", tags=["meta"])
def health():
    """Confirms the API is up and can actually reach the database."""
    with get_cursor() as cur:
        cur.execute("SELECT 1 AS ok")
        cur.fetchone()
    return {"status": "ok", "database": "connected"}
