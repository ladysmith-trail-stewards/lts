"""Trail fetch queries."""

from typing import Optional

import psycopg2.extensions


def fetch_trail(
    conn: psycopg2.extensions.connection,
    trail_id: int,
) -> Optional[dict]:
    """Return a single active trail by ID, or None if not found / soft-deleted."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, ST_AsGeoJSON(geometry) AS geometry
            FROM   public.trails
            WHERE  id = %s
              AND  deleted_at IS NULL
            """,
            (trail_id,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {"id": row[0], "geometry": row[1]}


def fetch_all_trails(conn: psycopg2.extensions.connection) -> list[dict]:
    """Return all active (non-deleted) trails."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, ST_AsGeoJSON(geometry) AS geometry
            FROM   public.trails
            WHERE  deleted_at IS NULL
            ORDER  BY id
            """
        )
        rows = cur.fetchall()
    return [{"id": r[0], "geometry": r[1]} for r in rows]


def fetch_outdated_trails(conn: psycopg2.extensions.connection) -> list[dict]:
    """Return trails whose elevation profile is missing or out of date.

    A trail is considered out of date when its geometry was updated more than
    30 seconds after the elevation profile was last computed, or when no
    elevation entry exists yet.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, ST_AsGeoJSON(t.geometry) AS geometry
            FROM   public.trails t
            LEFT   JOIN public.trail_elevations te ON te.trail_id = t.id
            WHERE  t.deleted_at IS NULL
              AND  (
                     te.trail_id IS NULL
                     OR t.geom_updated_at > te.updated_at + INTERVAL '30 seconds'
                   )
            ORDER  BY t.id
            """
        )
        rows = cur.fetchall()
    return [{"id": r[0], "geometry": r[1]} for r in rows]
