"""Elevation upsert queries."""

from datetime import datetime
from typing import Optional

import psycopg2.extensions
import psycopg2.extras


def upsert_trail_elevation(
    conn: psycopg2.extensions.connection,
    trail_id: int,
    geom4d_wkt: str,
    geom4d_ld_wkt: Optional[str],
    sample_interval_m: float,
    sample_interval_ld_m: float,
    geom_snapshot_at: Optional[datetime],
) -> None:
    """Insert or replace the elevation data for a single trail."""
    batch_upsert_trail_elevations(
        conn,
        [{"trail_id": trail_id,
          "geom4d_wkt": geom4d_wkt,
          "geom4d_ld_wkt": geom4d_ld_wkt,
          "sample_interval_m": sample_interval_m,
          "sample_interval_ld_m": sample_interval_ld_m,
          "geom_snapshot_at": geom_snapshot_at}],
    )


def batch_upsert_trail_elevations(
    conn: psycopg2.extensions.connection,
    rows: list[dict],
) -> None:
    """Bulk-insert or replace elevation data for multiple trails in one round-trip.

    Each element of ``rows`` must have keys:
        trail_id              int
        geom4d_wkt            str        (WKT LINESTRINGZM; HRDEM + Copernicus fallback, full resolution)
        geom4d_ld_wkt         str | None (WKT LINESTRINGZM; Copernicus only, downsampled)
        sample_interval_m     float      (densification spacing used for geom4d)
        sample_interval_ld_m  float      (downsampling spacing used for geom4d_ld)
        geom_snapshot_at      datetime | None
    """
    if not rows:
        return

    values = [
        (
            r["trail_id"],
            r["geom4d_wkt"],
            r["geom4d_ld_wkt"],   # may be None
            r["geom4d_ld_wkt"],   # repeated for the CASE WHEN guard
            r["sample_interval_m"],
            r["sample_interval_ld_m"],
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
                geom4d,
                geom4d_ld,
                sample_interval_m,
                sample_interval_ld_m,
                geom_snapshot_at,
                updated_at
            )
            VALUES %s
            ON CONFLICT (trail_id) DO UPDATE SET
                geom4d               = EXCLUDED.geom4d,
                geom4d_ld            = EXCLUDED.geom4d_ld,
                sample_interval_m    = EXCLUDED.sample_interval_m,
                sample_interval_ld_m = EXCLUDED.sample_interval_ld_m,
                geom_snapshot_at     = EXCLUDED.geom_snapshot_at,
                updated_at           = now()
            """,
            values,
            template=(
                "(%s,"
                " ST_SetSRID(ST_GeomFromText(%s), 4326),"
                " CASE WHEN %s IS NOT NULL THEN ST_SetSRID(ST_GeomFromText(%s), 4326) END,"
                " %s, %s, %s, now())"
            ),
        )
    conn.commit()
