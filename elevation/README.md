# LTS Elevation Profile Generator

Standalone Python tool that enriches trail data with elevation profiles.

## What it does

1. Reads 2-D trail geometries from the Supabase PostgreSQL database.
2. Queries the **NRCan HRDEM STAC API** for LiDAR DTM tiles covering each
   trail's bounding box (≤ 1 m resolution, Canada), fetching only the needed
   region via HTTP range requests against Cloud-Optimised GeoTIFFs (COGs).
3. For any point outside HRDEM coverage, falls back to the
   **Copernicus DEM GLO-30** (~30 m, global) downloaded from the AWS Open Data
   public bucket via HTTPS (tiles are cached locally).
4. Densifies each trail to a vertex every **5 m** using great-circle
   interpolation in pure Python (no GDAL required).
5. Samples elevation at each vertex (HRDEM first, Copernicus GLO-30 fallback).
6. Writes the results back to the `trail_elevations` table as:
   - a 3-D `LineStringZ` geometry (EPSG:4326, Z = metres above sea level), and
   - a JSON elevation profile (`[{distance_m, elevation_m}, …]`).

The `trails.geom_updated_at` column is automatically bumped by a DB trigger
whenever the trail geometry changes. The `update-outdated` command uses
`geom_snapshot_at` in `trail_elevations` to skip already-current trails.

## Requirements

| Dependency      | Version | Notes                                         |
| --------------- | ------- | --------------------------------------------- |
| Python          | ≥ 3.11  |                                               |
| GDAL            | ≥ 3.8   | Raster I/O (system library + Python bindings) |
| psycopg2-binary | ≥ 2.9   | PostgreSQL driver                             |
| requests        | ≥ 2.31  | HTTP client (STAC API queries)                |
| python-dotenv   | ≥ 1.0   | `.env` file support                           |
| numpy           | ≥ 1.24  | Required by GDAL Python bindings              |
| tqdm            | ≥ 4.0   | Progress bar                                  |

**macOS (Homebrew):** install the system GDAL library first, then pip will find the matching bindings:

```bash
brew install gdal
```

## Setup

```bash
cd elevation
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Configure database URLs in the root `.env`:

```
DEV_DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
PROD_DIRECT_DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

## Usage

```bash
# Local Supabase instance (default) ─────────────────────────────────────────
python main.py update-trail --id 42
python main.py update-all
python main.py update-outdated

# Production Supabase ─────────────────────────────────────────────────────────
python main.py --prod update-trail --id 42
python main.py --prod update-all
python main.py --prod update-outdated
```

`--prod` reads `PROD_DIRECT_DATABASE_URL` from `.env`; the default reads `DEV_DIRECT_DATABASE_URL`.

## DEM sources

### NRCan HRDEM LiDAR DTM — STAC + COG range requests (≤ 1 m, Canada)

- **Resolution**: 1 m (LiDAR-derived DTM — bare-earth terrain model)
- **Coverage**: surveyed areas of Canada (Vancouver Island well-covered)
- **STAC API**: `https://datacube.services.geo.ca/stac/api/search?collections=hrdem-lidar`
- **Tiles**: Cloud-Optimised GeoTIFFs on `canelevation-dem.s3.ca-central-1.amazonaws.com`
- **Access**: free, no API key required
- **Open data portal**: [HRDEM on open.canada.ca][open-canada]

[open-canada]: https://open.canada.ca/data/en/dataset/957782bf-847c-4644-a757-e383c0057995

Before processing a batch of trails, `warm_cache()` computes the **union
bounding box** of all trails, queries STAC once to identify which tiles
intersect, then clips the relevant region from each remote COG using
`gdal.Translate` with HTTP range requests — only the needed blocks are
transferred. The result is a small local GeoTIFF (~26 MB for the Ladysmith
area, vs ~6.8 GB for the full Vancouver Island tile).

On subsequent runs the cached clip is used directly with zero network traffic.
If new trails are added outside the cached clip area, `_clip_covers()` detects
the gap and automatically fetches a wider clip on the next run.

### Copernicus DEM GLO-30 via AWS Open Data (~30 m, global fallback)

- **Resolution**: ~30 m (1 arc-second, Copernicus DEM GLO-30)
- **Coverage**: global (80°S – 90°N)
- **Source**: [AWS Open Data — Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/)
- **Access**: direct HTTPS download from the public S3 bucket  
  `https://copernicus-dem-30m.s3.amazonaws.com/`
- **Cost**: free, no API key or AWS account required

Tiles are 1°×1° GeoTIFF files. The tool identifies which tiles cover the
trail's bounding box, downloads any that are not already cached, and merges
them into a GDAL VRT for sampling.

## Tile cache

Both DEM sources cache files to `DEM_CACHE_DIR` (default: `~/.cache/lts_dem`).
Override via the `DEM_CACHE_DIR` environment variable.

| File                                                                    | Approx. size | Description                                                                   |
| ----------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| `{item_id}.tif` (e.g. `BC-Vancouver_Island_Sunshine_Coast_2018-1m.tif`) | ~26 MB       | HRDEM clip covering the trail union bbox, fetched once via COG range requests |
| `Copernicus_DSM_COG_10_N48_00_W124_00_DEM.tif`                          | ~24 MB       | Full 1°×1° Copernicus fallback tile                                           |

**HRDEM clips** are keyed by STAC item ID — one file per tile, covering the
union bounding box of all trails. If the bbox grows (new trails added), the
clip is automatically widened on the next run.

**Copernicus tiles** are one file per 1°×1° degree cell and are never
re-downloaded unless deleted.

To force a fresh fetch, delete the cache directory:

```bash
rm -rf ~/.cache/lts_dem   # or the path set in DEM_CACHE_DIR
```

## Database changes

- `trails.geom_updated_at` — timestamp updated by trigger whenever `geometry`
  changes; used to detect stale elevation profiles.
- `trail_elevations` table — 1-to-1 with `trails`; stores `geometry_3d`,
  `elevation_profile` (JSONB), `geom_snapshot_at`, and `updated_at`.
  `geom_snapshot_at` records the `geom_updated_at` value at the time of the
  last elevation computation, so `update-outdated` can skip unchanged trails.

## Project structure

```
elevation/
  main.py               CLI entry point (update-trail / update-all / update-outdated)
  requirements.txt
  dem/
    base.py             Abstract DemProvider
    hrdem.py            NRCan HRDEM via STAC + COG range requests (high-res, Canada)
    copernicus.py       Copernicus GLO-30 via AWS Open Data COG tiles (~30 m, global fallback)
  db/
    client.py           psycopg2 connection helper (reads DEV/PROD_DIRECT_DATABASE_URL)
    trails.py           Trail fetch queries (includes geom_updated_at)
    elevations.py       Elevation batch upsert (includes geom_snapshot_at)
  processing/
    densify.py          Pure-Python great-circle densification (no GDAL)
    profile.py          3D geometry + elevation profile builder
```
