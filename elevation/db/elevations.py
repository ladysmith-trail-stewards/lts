"""Elevation upsert queries."""

import json
from datetime import datetime
from typing import Optional

import psycopg2.extensions
import psycopg2.extras


def upsert_trail_elevation(
    conn: psycopg2.extensions.connection,
    trail_id: int,
    geometry_3d_geojson: str,
    elevation_profile: list[dict],
    geom_snapshot_at: Optional[datetime],
) -> None:
    """Insert or replace the elevation data for a single trail."""
    batch_upsert_trail_elevations(
        conn,
        [{"trail_id": trail_id,
          "geometry_3d_geojson": geometry_3d_geojson,
          "elevation_profile": elevation_profile,
          "geom_snapshot_at": geom_snapshot_at}],
    )


def batch_upsert_trail_elevations(
    conn: psycopg2.extensions.connection,
    rows: list[dict],
) -> None:
    """Bulk-insert or replace elevation data for multiple trails in one round-trip.

    Each element of ``rows`` must have keys:
        trail_id              int
        geometry_3d_geojson   str   (GeoJSON LineStringZ)
        elevation_profile     list  ([{distance_m, elevation_m}, …])
        geom_snapshot_at      datetime | None
    """
    if not rows:
        return

    values = [
        (
            r["trail_id"],
            r["geometry_3d_geojson"],
            json.dumps(r["elevation_profile"]),
            r["geom_snapshot_at"],
        )
        for r in rows
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO public.trail_elevations (
                trail_id,
                geometry_3d,
                elevation_profile,
                geom_snapshot_at,
                updated_at
            )
            VALUES %s
            ON CONFLICT (trail_id) DO UPDATE SET
                geometry_3d       = EXCLUDED.geometry_3d,
                elevation_profile = EXCLUDED.elevation_profile,
                geom_snapshot_at  = EXCLUDED.geom_snapshot_at,
                updated_at        = now()
            """,
            values,
            template=(
                "(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s::jsonb, %s, now())"
            ),
        )
    conn.commit()
