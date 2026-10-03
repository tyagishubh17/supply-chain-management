"""PostgreSQL / Supabase connection handling.

Credentials are never hardcoded: everything comes from the environment
(see backend/.env.example).

A small connection pool is used because a Supabase database is remote, so
opening a fresh TCP + TLS connection for every request would dominate the
response time. Borrowing a pooled connection costs a couple of
milliseconds instead.
"""

import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
        "and fill in your Supabase connection string."
    )

pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=int(os.getenv("DB_POOL_MAX", "5")),
    # prepare_threshold=None keeps psycopg from caching prepared statements.
    # Disable prepared-statement caching because schema reloads can invalidate
    # cached query plans when PostgreSQL types are recreated.
    # Without it, the first query after the schema is reloaded fails with
    # "cached plan must not change result type" -- schema.sql recreates the
    # order_status type, so the cached plan's result type no longer exists --
    # and returns a 500. The same applies to any migration run against a live
    # database. Parsing each execution is cheap next to a network round trip
    # to a remote database.
    kwargs={
        "row_factory": dict_row,
        "prepare_threshold": None,
    },
    # Opened explicitly by the app's lifespan handler, so a bad
    # DATABASE_URL fails at start-up rather than on the first request.
    open=False,
)

# Centralise connection and cursor handling so callers do not repeat
# transaction-management boilerplate.
@contextmanager
def get_cursor():
    """Yield a dict-returning cursor inside a transaction.

    The connection context manager commits the transaction when the block
    exits cleanly and rolls it back if it raises, which is what makes a
    multi-statement operation all-or-nothing.
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            yield cur


def fetch_all(
    sql: str,
    params: tuple = (),
) -> list[dict]:
    """Execute a query and return all rows as dictionaries."""
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()



def fetch_one(
    sql: str,
    params: tuple = (),
) -> dict | None:
    """Execute a query and return one row, or None when no row exists."""
    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def call_function(
    sql: str,
    params: tuple = (),
) -> dict | None:
    """Run a statement that may RAISE EXCEPTION inside PL/pgSQL.

    The database is the authority on the business rules, so its message is
    what the user should see -- e.g. "Only 5 units are currently
    available." A raised exception becomes a 400 carrying that exact text,
    and a violated CHECK or UNIQUE becomes a 400 with a readable summary.

    Note the exception class is RaiseException, not RaisedException. Naming
    it wrongly makes every business-rule refusal surface as a generic 500.
    """
    try:
        with get_cursor() as cur:
            cur.execute(sql, params)
            return (
                cur.fetchone()
                if cur.description
                else None
            )
        
    except psycopg.errors.RaiseException as exc:
        raise HTTPException(
            status_code=400,
            detail=_message(exc),
        ) from exc
    except psycopg.errors.IntegrityError as exc:
        raise HTTPException(
            status_code=400,
            detail=_message(exc),
        ) from exc


def _message(exc: psycopg.Error) -> str:
    """Extract a concise database error message for API responses."""
    return (
        exc.diag.message_primary
        or str(exc)
    ).strip()
