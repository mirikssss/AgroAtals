"""
Satellite Evidence — Copernicus Data Space Sentinel Hub Process API (Sentinel-2 L2A).
Renders true color and NDVI for AOI; caches by hash(AOI)+product+year+crop+size; never exposes tokens.
Разрешение подбирается по GSD (10 m/px). В запрос передаётся geometry (polygon), а не только bbox.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import math
import os
import struct
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger("dashboard.satellite")

# Env: OAuth2 for Copernicus Data Space (Sentinel Hub)
CDS_CLIENT_ID = os.environ.get("CDS_CLIENT_ID") or os.environ.get("SENTINEL_HUB_CLIENT_ID", "")
CDS_CLIENT_SECRET = os.environ.get("CDS_CLIENT_SECRET") or os.environ.get("SENTINEL_HUB_CLIENT_SECRET", "")
CDS_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
CDS_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

# Cache: in-memory, key -> { "b64": str, "expires_at": float }
_SATELLITE_CACHE: dict[str, dict[str, Any]] = {}
CACHE_TTL_SEC = float(os.environ.get("SATELLITE_CACHE_TTL_SEC", "86400"))  # 24h
HTTP_TIMEOUT = float(os.environ.get("SATELLITE_HTTP_TIMEOUT", "90"))
GSD_M = float(os.environ.get("SATELLITE_GSD_M", "10"))  # целевое разрешение м/пиксель (Sentinel-2 нативно ~10)
MAX_OUTPUT = int(os.environ.get("SATELLITE_MAX_OUTPUT", "2500"))
# Для малых участков не задирать размер: 10 га = ~316 м → 32 px по 10 м/px. Раньше min=512 давало апскейл и "мыло".
MIN_OUTPUT = int(os.environ.get("SATELLITE_MIN_OUTPUT", "32"))

# Evalscripts
EVALSCRIPT_TRUECOLOR = """
//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04"],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
}
"""

EVALSCRIPT_NDVI = """
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08"],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  if (ndvi < -0.2) return [0.75, 0.75, 0.75];
  if (ndvi < 0) return [0.92, 0.92, 0.92];
  if (ndvi < 0.2) return [0.5, 0.7, 0.28];
  if (ndvi < 0.4) return [0.25, 0.49, 0.14];
  if (ndvi < 0.6) return [0.06, 0.33, 0.04];
  return [0, 0.27, 0];
}
"""


def _bbox_meters(bbox: list[float]) -> tuple[float, float]:
    """Bbox [min_lon, min_lat, max_lon, max_lat] -> (width_m, height_m). Грубо, но достаточно для sizing."""
    min_lon, min_lat, max_lon, max_lat = bbox
    lat_mid = (min_lat + max_lat) / 2.0
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat_mid))
    width_m = (max_lon - min_lon) * m_per_deg_lon
    height_m = (max_lat - min_lat) * m_per_deg_lat
    return abs(width_m), abs(height_m)


def _pick_size_for_gsd(
    bbox: list[float],
    gsd_m: float = GSD_M,
    max_size: int = MAX_OUTPUT,
    min_size: int = MIN_OUTPUT,
) -> int:
    """Подбирает width/height под целевой GSD (м/пиксель). Для Sentinel-2 разумно 10 м/px."""
    w_m, h_m = _bbox_meters(bbox)
    needed = int(math.ceil(max(w_m, h_m) / gsd_m))
    return max(min_size, min(max_size, needed))


def _pick_size_for_gsd_diagnostic(bbox: list[float]) -> tuple[float, float, float, int, int]:
    """(w_m, h_m, area_ha, needed_px_unclamped, size_clamped) для логов и API diagnostics."""
    w_m, h_m = _bbox_meters(bbox)
    area_ha = (w_m * h_m) / 10_000.0
    needed = int(math.ceil(max(w_m, h_m) / GSD_M))
    size = max(MIN_OUTPUT, min(MAX_OUTPUT, needed))
    return w_m, h_m, area_ha, needed, size


def _polygon_to_geojson(polygon: list[list[float]]) -> list[list[list[float]]]:
    """Polygon as [lat, lng] (frontend) -> GeoJSON coordinates: [ [ [lon, lat], ... ] ] closed ring."""
    if not polygon or len(polygon) < 3:
        return []
    ring = [[float(p[1]), float(p[0])] for p in polygon]
    if ring[0] != ring[-1]:
        ring.append(ring[0][:])
    return [ring]


def _cache_key(
    bbox: list[float],
    product: str,
    year: int,
    crop: str,
    size: int,
    polygon_geojson: Optional[list] = None,
) -> str:
    raw = f"{bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f}|{product}|{year}|{crop}|{size}"
    if polygon_geojson:
        raw += "|" + hashlib.sha256(str(polygon_geojson).encode()).hexdigest()[:16]
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _png_dimensions(raw: bytes) -> Optional[tuple[int, int]]:
    """Читает ширину и высоту из PNG IHDR без PIL."""
    if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    # IHDR: width 4 bytes, height 4 bytes at offset 16 (big-endian)
    w, h = struct.unpack(">II", raw[16:24])
    return (w, h)


def _get_oauth_token() -> Optional[str]:
    if not CDS_CLIENT_ID or not CDS_CLIENT_SECRET:
        return None
    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                CDS_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": CDS_CLIENT_ID,
                    "client_secret": CDS_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            r.raise_for_status()
            return r.json().get("access_token")
    except Exception as e:
        logger.warning("CDS OAuth failed: %s", e)
        return None


def _request_image(
    bbox: list[float],
    time_from: str,
    time_to: str,
    product: str,
    evalscript: str,
    polygon_geojson: Optional[list] = None,
) -> Optional[bytes]:
    """
    Request image from CDS Process API.
    bbox: [min_lon, min_lat, max_lon, max_lat] (CRS84).
    Если polygon_geojson задан — передаём geometry (рендер ровно по полю), иначе bbox.
    Размер подбирается по GSD 10 m/px.
    """
    token = _get_oauth_token()
    if not token:
        return None
    w_m, h_m, area_ha, needed_px, size = _pick_size_for_gsd_diagnostic(bbox)
    effective_gsd = (max(w_m, h_m) / size) if size else 0
    logger.info(
        "satellite request: area_ha=%.2f bbox_m=%.0fx%.0f needed_px=%d requested_size=%d effective_gsd_m=%.1f (Sentinel-2 ~10 m/px)",
        area_ha, w_m, h_m, needed_px, size, effective_gsd,
    )

    if polygon_geojson:
        bounds = {
            "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            "geometry": {"type": "Polygon", "coordinates": polygon_geojson},
        }
    else:
        bounds = {
            "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            "bbox": bbox,
        }

    payload = {
        "input": {
            "bounds": bounds,
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": time_from, "to": time_to},
                        "maxCloudCoverage": 30,
                        "mosaickingOrder": "mostRecent",
                    },
                }
            ],
        },
        "output": {"width": size, "height": size},
        "evalscript": evalscript,
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            r = client.post(
                CDS_PROCESS_URL,
                json=payload,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            r.raise_for_status()
            raw = r.content
            dims = _png_dimensions(raw)
            if dims:
                logger.info(
                    "CDS returned image %dx%d (requested %d) | display: request size matches pixels; on frontend compare img.naturalWidth×naturalHeight vs CSS px × devicePixelRatio",
                    dims[0], dims[1], size,
                )
            return raw
    except Exception as e:
        if polygon_geojson and "400" in str(e):
            logger.warning("CDS rejected geometry, retrying with bbox only: %s", e)
            bounds_fallback = {
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
                "bbox": bbox,
            }
            payload["input"]["bounds"] = bounds_fallback
            try:
                with httpx.Client(timeout=HTTP_TIMEOUT) as client2:
                    r2 = client2.post(CDS_PROCESS_URL, json=payload, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
                    r2.raise_for_status()
                    return r2.content
            except Exception as e2:
                logger.warning("CDS Process API (bbox fallback) failed: %s", e2)
                return None
        logger.warning("CDS Process API request failed: %s", e)
        return None


def _year_to_interval(year: int) -> tuple[str, str]:
    """Growing season window for Central Asia (e.g. cotton): Jun–Sep."""
    return (f"{year}-06-01T00:00:00Z", f"{year}-09-30T23:59:59Z")


def get_satellite_image(
    bbox: list[float],
    year: int,
    product: str,
    crop: str,
    use_cache: bool = True,
    polygon: Optional[list[list[float]]] = None,
) -> tuple[Optional[str], Optional[str], bool, Optional[tuple[int, int]]]:
    """
    Returns (data_url_or_none, cloud_hint_or_none, from_cache, (width, height)_or_none).
    Если polygon задан — в API передаётся geometry (обрезка по полю), размер по GSD 10 m/px.
    """
    evalscript = EVALSCRIPT_NDVI if product == "ndvi" else EVALSCRIPT_TRUECOLOR
    polygon_geojson = _polygon_to_geojson(polygon) if polygon and len(polygon) >= 3 else None
    size = _pick_size_for_gsd(bbox)
    key = _cache_key(bbox, product, year, crop, size, polygon_geojson)
    if use_cache:
        entry = _SATELLITE_CACHE.get(key)
        if entry and entry.get("expires_at", 0) > time.time():
            logger.info("satellite cache_hit key=%s product=%s year=%s size=%s", key[:8], product, year, size)
            dims = (entry.get("width"), entry.get("height")) if entry.get("width") else None
            return entry.get("data_url"), entry.get("cloud_hint"), True, dims
        logger.info("satellite cache_miss key=%s product=%s year=%s size=%s", key[:8], product, year, size)

    time_from, time_to = _year_to_interval(year)
    raw = _request_image(bbox, time_from, time_to, product, evalscript, polygon_geojson)
    if not raw:
        return None, None, False, None

    dims = _png_dimensions(raw)
    b64 = base64.b64encode(raw).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"
    cloud_hint = "Cloud coverage ≤30%, most recent composite"

    if use_cache:
        _SATELLITE_CACHE[key] = {
            "data_url": data_url,
            "cloud_hint": cloud_hint,
            "expires_at": time.time() + CACHE_TTL_SEC,
            "width": dims[0] if dims else None,
            "height": dims[1] if dims else None,
        }

    return data_url, cloud_hint, False, dims


def bbox_from_polygon(polygon: list[list[float]]) -> list[float]:
    """Polygon as list of [lat, lng] (from frontend) -> [min_lon, min_lat, max_lon, max_lat] CRS84."""
    if not polygon:
        return [64.0, 40.0, 66.0, 42.0]
    lats = [p[0] for p in polygon if len(p) >= 2]
    lons = [p[1] for p in polygon if len(p) >= 2]
    if not lats or not lons:
        return [64.0, 40.0, 66.0, 42.0]
    return [min(lons), min(lats), max(lons), max(lats)]


def timelapse_response(
    polygon: Optional[list[list[float]]],
    country: str,
    region_level: str,
    region_id: Optional[str],
    crop: str,
    year: int,
    product: str,
) -> dict[str, Any]:
    """
    GET /dashboard/satellite/timelapse.
    Returns { year_used, years: [{year, imageUrl}], baseline: {imageUrl, yearsUsed} }.
    Uses polygon bbox if provided; otherwise could fall back to region centroid (not implemented here).
    """
    if not polygon or len(polygon) < 3:
        return {
            "year_used": year,
            "years": [],
            "baseline": {"imageUrl": None, "yearsUsed": []},
            "error": "Missing or invalid polygon",
        }

    if not _get_oauth_token():
        return {
            "year_used": year,
            "years": [],
            "baseline": {"imageUrl": None, "yearsUsed": []},
            "error": "Satellite credentials not configured (CDS_CLIENT_ID / CDS_CLIENT_SECRET)",
        }

    bbox = bbox_from_polygon(polygon)
    span_lon = bbox[2] - bbox[0]
    span_lat = bbox[3] - bbox[1]
    logger.info("AOI bbox=%s span_lon=%.4f span_lat=%.4f (deg)", bbox, span_lon, span_lat)
    w_m, h_m, area_ha, needed_px, requested_size = _pick_size_for_gsd_diagnostic(bbox)
    effective_gsd = (max(w_m, h_m) / requested_size) if requested_size else 0
    logger.info("AOI ~%.0f m x %.0f m (%.2f ha) -> needed_px=%d requested_size=%d effective_gsd=%.1f m/px", w_m, h_m, area_ha, needed_px, requested_size, effective_gsd)

    current_year = year
    year_min = 2017
    year_max = min(current_year, 2025)

    years_list = list(range(year_min, year_max + 1))
    if not years_list:
        years_list = [current_year]

    out_years: list[dict[str, Any]] = []
    first_dims: Optional[tuple[int, int]] = None
    for y in years_list:
        data_url, cloud_hint, _, dims = get_satellite_image(bbox, y, product, crop, use_cache=True, polygon=polygon)
        if dims and first_dims is None:
            first_dims = dims
        out_years.append({
            "year": y,
            "imageUrl": data_url,
            "cloudHint": cloud_hint,
            "compositeWindow": f"{y}-06-01 to {y}-09-30",
            "source": "Sentinel-2 L2A (Copernicus)",
        })

    # Baseline = representative of last 5 years <= year_used (e.g. median year)
    baseline_years = [y for y in years_list if y <= current_year][-5:]
    if not baseline_years:
        baseline_years = [years_list[-1]] if years_list else [current_year]
    baseline_year = baseline_years[len(baseline_years) // 2]
    baseline_url, baseline_cloud, _, baseline_dims = get_satellite_image(bbox, baseline_year, product, crop, use_cache=True, polygon=polygon)
    if baseline_dims and first_dims is None:
        first_dims = baseline_dims

    diagnostics: dict[str, Any] = {
        "areaHa": round(area_ha, 2),
        "bboxMeters": {"width": round(w_m, 0), "height": round(h_m, 0)},
        "gsdMeters": GSD_M,
        "neededPx": needed_px,
        "requestedSizePx": requested_size,
        "effectiveGsdM": round(effective_gsd, 1),
        "note": "Sentinel-2 ~10 m/px; small AOI = few pixels, upscaling on display causes blur. Compare img.naturalWidth×naturalHeight vs CSS px × devicePixelRatio on frontend.",
    }
    if first_dims:
        diagnostics["imageWidth"] = first_dims[0]
        diagnostics["imageHeight"] = first_dims[1]

    return {
        "year_used": current_year,
        "years": out_years,
        "baseline": {
            "imageUrl": baseline_url,
            "yearsUsed": baseline_years,
            "cloudHint": baseline_cloud,
        },
        "diagnostics": diagnostics,
    }


def preview_response(
    polygon: list[list[float]],
    date_from: str,
    date_to: str,
    product: str,
) -> dict[str, Any]:
    """
    GET /dashboard/satellite/preview.
    Returns { imageUrl, compositeWindow, source, cloudHint }.
    """
    bbox = bbox_from_polygon(polygon)
    logger.info("preview AOI bbox=%s span_lon=%.4f span_lat=%.4f", bbox, bbox[2] - bbox[0], bbox[3] - bbox[1])
    polygon_geojson = _polygon_to_geojson(polygon) if len(polygon) >= 3 else None
    evalscript = EVALSCRIPT_NDVI if product == "ndvi" else EVALSCRIPT_TRUECOLOR
    time_from = f"{date_from}T00:00:00Z" if "T" not in date_from else date_from
    time_to = f"{date_to}T23:59:59Z" if "T" not in date_to else date_to

    token = _get_oauth_token()
    if not token:
        return {"imageUrl": None, "error": "Satellite credentials not configured"}

    raw = _request_image(bbox, time_from, time_to, product, evalscript, polygon_geojson)
    if not raw:
        return {"imageUrl": None, "error": "Image request failed"}

    b64 = base64.b64encode(raw).decode("ascii")
    return {
        "imageUrl": f"data:image/png;base64,{b64}",
        "compositeWindow": f"{date_from} to {date_to}",
        "source": "Sentinel-2 L2A (Copernicus)",
        "cloudHint": "Cloud coverage ≤30%, most recent composite",
    }
