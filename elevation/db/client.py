"""Database connection helper."""

import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_connection() -> psycopg2.extensions.connection:
    """Return a psycopg2 connection using environment variables.

    Reads DATABASE_URL first; falls back to individual PGHOST / PGUSER /
    PGPASSWORD / PGDATABASE / PGPORT variables.

    The connection bypasses Supabase RLS and runs with the PostgreSQL role
    specified in the connection string (postgres / service_role for the
    Supabase direct connection URL).
    """
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return psycopg2.connect(db_url)

    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", "5432")),
        dbname=os.environ.get("PGDATABASE", "postgres"),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
    )
