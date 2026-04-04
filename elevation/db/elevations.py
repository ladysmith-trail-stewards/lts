"""Elevation upsert queries."""

import json

import psycopg2.extensions


def upsert_trail_elevation(
    conn: psycopg2.extensions.connection,
    trail_id: int,
    geometry_3d_geojson: str,
    elevation_profile: list[dict],
) -> None:
    """Insert or replace the elevation data for a trail.

    Args:
        conn:                  Open database connection.
        trail_id:              The trail's primary key.
        geometry_3d_geojson:   GeoJSON string of a LineStringZ in WGS84.
        elevation_profile:     List of {distance_m, elevation_m} dicts.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.trail_elevations (
                trail_id,
                geometry_3d,
                elevation_profile,
                updated_at
            )
            VALUES (
                %s,
                ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                %s::jsonb,
                now()
            )
            ON CONFLICT (trail_id) DO UPDATE SET
                geometry_3d       = EXCLUDED.geometry_3d,
                elevation_profile = EXCLUDED.elevation_profile,
                updated_at        = now()
            """,
            (trail_id, geometry_3d_geojson, json.dumps(elevation_profile)),
        )
    conn.commit()
