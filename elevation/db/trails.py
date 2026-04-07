"""Trail fetch queries.

Geometries are returned in WGS84 (EPSG:4326) as parsed GeoJSON dicts.
Densification happens in Python (``processing/densify.py``) using great-circle
interpolation, so no reprojection is needed in the fetch layer.
"""

import json
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
            SELECT id, ST_AsGeoJSON(geometry), geom_updated_at
            FROM   public.trails
            WHERE  id = %s
              AND  deleted_at IS NULL
            """,
            (trail_id,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {"id": row[0], "geometry": json.loads(row[1]), "geom_updated_at": row[2]}


def fetch_all_trails(conn: psycopg2.extensions.connection) -> list[dict]:
    """Return all active (non-deleted) trails."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, ST_AsGeoJSON(geometry), geom_updated_at
            FROM   public.trails
            WHERE  deleted_at IS NULL
            ORDER  BY id
            """
        )
        rows = cur.fetchall()
    return [{"id": r[0], "geometry": json.loads(r[1]), "geom_updated_at": r[2]} for r in rows]


def fetch_outdated_trails(conn: psycopg2.extensions.connection) -> list[dict]:
    """Return trails whose elevation profile is missing or out of date.

    A trail is considered out of date when its geom_updated_at differs from
    the geom_snapshot_at stored at last compute time, or when no elevation
    entry exists yet.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id, ST_AsGeoJSON(t.geometry), t.geom_updated_at
            FROM   public.trails t
            LEFT   JOIN public.trail_elevations te ON te.trail_id = t.id
            WHERE  t.deleted_at IS NULL
              AND  (
                     te.trail_id IS NULL
                     OR te.geom_snapshot_at IS NULL
                     OR t.geom_updated_at > te.geom_snapshot_at
                   )
            ORDER  BY t.id
            """
        )
        rows = cur.fetchall()
    return [{"id": r[0], "geometry": json.loads(r[1]), "geom_updated_at": r[2]} for r in rows]
