"""Database connection helper."""

import os

import psycopg2
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())


def get_connection(prod: bool = False) -> psycopg2.extensions.connection:
    """Return a psycopg2 connection using environment variables.

    When prod=True reads PROD_DATABASE_URL, otherwise DATABASE_URL.
    Both point to a direct PostgreSQL connection that bypasses Supabase RLS.
    """
    key = "PROD_DIRECT_DATABASE_URL" if prod else "DEV_DIRECT_DATABASE_URL"
    db_url = os.environ.get(key)
    if not db_url:
        raise RuntimeError(
            f"{key} is not set. "
            "Add it to .env and fill in the connection string."
        )
    return psycopg2.connect(db_url)
