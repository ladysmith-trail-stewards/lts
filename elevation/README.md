# LTS Elevation Profile Generator

Standalone Python tool that enriches trail data with elevation profiles.

## What it does

1. Reads 2-D trail geometries from the Supabase PostgreSQL database.
2. Fetches a high-resolution Digital Elevation Model (DEM) tile from the
   **NRCan HRDEM Mosaic** (≤ 1 m resolution, Canada) via OGC WCS 2.0.1.
3. For any point outside the HRDEM coverage, falls back to the
   **Open-Meteo Elevation API** (~90 m Copernicus DEM, global).
4. Uses GDAL to densify each trail to a vertex every **5 m** along the line.
5. Samples elevation at each vertex (HRDEM first, Open-Meteo fallback).
6. Writes the results back to the `trail_elevations` table as:
   - a 3-D `LineStringZ` geometry (EPSG:4326, Z = metres above sea level), and
   - a JSON elevation profile (`[{distance_m, elevation_m}, …]`).

The `trails.geom_updated_at` column is automatically bumped by a DB trigger
whenever the trail geometry changes.  The `update-outdated` command uses this
to avoid re-processing trails whose geometry has not changed.

## Requirements

| Dependency      | Version   | Notes                             |
|-----------------|-----------|-----------------------------------|
| Python          | ≥ 3.11    |                                   |
| GDAL            | ≥ 3.6     | System library + Python bindings  |
| psycopg2-binary | ≥ 2.9     | PostgreSQL driver                 |
| requests        | ≥ 2.31    | HTTP client                       |
| python-dotenv   | ≥ 1.0     | `.env` file support               |

### Installing GDAL

**macOS (Homebrew)**

```bash
brew install gdal
pip install GDAL==$(gdal-config --version)
```

**Ubuntu / Debian**

```bash
sudo apt-get install gdal-bin python3-gdal libgdal-dev
pip install GDAL==$(gdal-config --version)
```

**Windows (conda)**

```bash
conda install -c conda-forge gdal
```

## Setup

```bash
cd elevation
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL to your Supabase direct connection string.
```

## Usage

```bash
# Recompute elevation for trail with id = 42
python main.py update-trail --id 42

# Recompute elevation for every active trail
python main.py update-all

# Recompute only trails whose geometry changed after the last elevation update
python main.py update-outdated
```

## DEM sources

### NRCan HRDEM Mosaic (high-resolution, Canada)

- **Resolution**: up to 1 m (DTM — bare-earth terrain model)
- **Coverage**: most surveyed/populated areas of Canada; patchy in remote areas
- **Service**: OGC WCS 2.0.1 at `https://datacube.services.geo.ca/ows/elevation`
- **Access guide**: [HRDEM_Mosaic_WCS-WMS_instructions_EN.pdf][wcs-guide]
- **Open data portal**: [HRDEM Mosaic on open.canada.ca][open-canada]

[wcs-guide]: https://www.download-telecharger.services.geo.ca/pub/elevation/dem_mne/HRDEMmosaic_mosaiqueMNEHR/HRDEM_Mosaic_WCS-WMS_instructions_EN.pdf
[open-canada]: https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b

The tool discovers the DTM coverage identifier automatically from
`GetCapabilities` on first run and caches it for subsequent trails.

### Open-Meteo Elevation API (low-resolution, global fallback)

- **Resolution**: ~90 m (Copernicus DEM GLO-90)
- **Coverage**: global
- **API**: `https://api.open-meteo.com/v1/elevation`
- **Cost**: free, no API key required

## Database changes

The migration `supabase/migrations/20260403000000_trail_elevation.sql` adds:

- `trails.geom_updated_at` — timestamp updated by trigger whenever `geometry`
  changes; used to detect stale elevation profiles.
- `trail_elevations` table — 1-to-1 with `trails`; stores `geometry_3d`,
  `elevation_profile` (JSONB), and `updated_at`.

## Project structure

```
elevation/
  main.py               CLI entry point (update-trail / update-all / update-outdated)
  requirements.txt
  .env.example
  dem/
    base.py             Abstract DemProvider
    hrdem.py            NRCan HRDEM via WCS (high-res, Canada)
    open_meteo.py       Open-Meteo API (low-res, global fallback)
  db/
    client.py           psycopg2 connection helper
    trails.py           Trail fetch queries
    elevations.py       Elevation upsert query
  processing/
    densify.py          GDAL geometry densification
    profile.py          3D geometry + elevation profile builder
```
