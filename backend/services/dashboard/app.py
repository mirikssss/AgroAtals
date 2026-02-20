"""
Dashboard Service — API Gateway и агрегатор данных.
Предоставляет: chart-data (из CSV), metrics (Risk + AI), recommend и explain-kpi (прокси к AI).
Микросервисы: Risk Service (predict), AI Service (tips, recommend, explain-kpi).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote

import httpx
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from dto import (
    ExplainKpiRequest,
    KPI_GROUP_VALUES,
    KPI_KEY_FINANCE,
    KPI_KEY_SATELLITE,
    KpiExplainRequest,
    PredictRequest,
    RegionDataRequest,
)

logger = logging.getLogger("dashboard.kpi")


class DegenerateFeaturesError(RuntimeError):
    pass

# Загрузка .env
_DASHBOARD_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _DASHBOARD_DIR.parent.parent.parent
load_dotenv(_DASHBOARD_DIR / ".env")
load_dotenv(_PROJECT_ROOT / ".env.local")

# Логирование: подавить CancelledError при uvicorn --reload
def _suppress_cancelled_error_filter(record: logging.LogRecord) -> bool:
    if record.levelno < logging.ERROR:
        return True
    exc_type, exc_val, _ = record.exc_info or (None, None, None)
    while exc_type is not None:
        if exc_type is asyncio.CancelledError or exc_type is KeyboardInterrupt:
            return False
        exc_val = getattr(exc_val, "__context__", None)
        exc_type = type(exc_val) if exc_val is not None else None
    if "CancelledError" in (record.getMessage() or ""):
        return False
    return True


for _name in ("uvicorn.error", "uvicorn", "starlette.routing", ""):
    _log = logging.getLogger(_name) if _name else logging.root
    _log.addFilter(_suppress_cancelled_error_filter)

# Все пути приводим к абсолютным (не зависят от cwd при запуске uvicorn)
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEPLOYMENT_DIR = Path(os.environ.get("DEPLOYMENT_DIR", str(BACKEND_DIR / "deployment"))).resolve()
PROJECT_ROOT = BACKEND_DIR.parent.resolve()
DATASET_PATH = Path(os.environ.get("DATASET_PATH", str(DEPLOYMENT_DIR / "dataset.csv"))).resolve()
DISTRICTS_DIR = Path(os.environ.get("DISTRICTS_DIR", str(PROJECT_ROOT / "public" / "districts"))).resolve()
if not DATASET_PATH.exists():
    raise RuntimeError(f"Dataset file not found: {DATASET_PATH}")
if not DISTRICTS_DIR.exists():
    logging.warning("DISTRICTS_DIR does not exist: %s — KPI по областям будут fallback на country", DISTRICTS_DIR)

os.environ.setdefault("NUMEXPR_MAX_THREADS", "8")

# Конфиг моделей (только feature_cols для _compute_features) и метрики модели
CONFIG_PATH = DEPLOYMENT_DIR / "config.json"
MODEL_METRICS: dict[str, Any] = {}
if CONFIG_PATH.exists():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _config = json.load(f)
    FEATURE_COLS = _config.get("feature_cols", [])
    _metrics = _config.get("metrics") or {}
    MODEL_METRICS = {
        "coverage_p90_p10_pct": round(float(_metrics.get("Coverage_Probability_%", 80.0)), 2),
        "downside_miss_rate_pct": round(float(_metrics.get("Downside_Miss_Rate_%", 16.9)), 2),
        "mae_p50": round(float(_metrics.get("MAE_p50", 1.35)), 3),
        "rmse_p50": round(float(_metrics.get("RMSE_p50", 1.60)), 3),
    }
else:
    FEATURE_COLS = []
    MODEL_METRICS = {"coverage_p90_p10_pct": 80.01, "downside_miss_rate_pct": 16.89, "mae_p50": 1.346, "rmse_p50": 1.604}
BASELINE_YEARS = 8  # спутниковые данные (лет)

# URL микросервисов
AI_SERVICE_URL = (os.environ.get("AI_SERVICE_URL") or "http://localhost:8001").rstrip("/")
RISK_SERVICE_URL = (os.environ.get("RISK_SERVICE_URL") or "http://localhost:8002").rstrip("/")
HTTP_TIMEOUT = float(os.environ.get("DASHBOARD_HTTP_TIMEOUT", "120.0"))

# DSCR reference (portfolio normalization: 1 ha)
BASE_YIELD_T_HA: dict[str, float] = {"wheat": 3.0, "cotton": 2.5, "rice": 4.0}
PRICE_PER_TON: dict[str, float] = {"wheat": 280.0, "cotton": 1200.0, "rice": 350.0}
COST_RATIO = float(os.environ.get("DSCR_COST_RATIO", "0.6"))
REFERENCE_LOAN_PER_HA = float(os.environ.get("DSCR_LOAN_PER_HA", "5000"))
REFERENCE_RATE_PCT = float(os.environ.get("DSCR_RATE_PCT", "12"))
REFERENCE_TERM_YEARS = float(os.environ.get("DSCR_TERM_YEARS", "5"))

# In-memory state for KPI diagnostics only (identical-region detection); no response cache
_kpi_last_by_scope: dict[tuple[str, str, int, str], tuple[str, float, float]] = {}
_sat_kpi_last_by_scope: dict[tuple[str, str, int, str], tuple[str, Optional[float], Optional[float]]] = {}

app = FastAPI(title="AgroAtlas Dashboard Service", version="2.0.0")


@app.on_event("startup")
def _log_routes() -> None:
    """При старте вывести пути и маршруты (диагностика для KPI по областям)."""
    # print() чтобы гарантированно видеть в консоли uvicorn
    print("Dashboard startup paths:")
    print(f"  DATASET_PATH={DATASET_PATH} exists={DATASET_PATH.exists()}")
    print(f"  DISTRICTS_DIR={DISTRICTS_DIR} exists={DISTRICTS_DIR.exists()}")
    print(f"  RISK_SERVICE_URL={RISK_SERVICE_URL}")
    print(f"  AI_SERVICE_URL={AI_SERVICE_URL}")
    if DISTRICTS_DIR.exists():
        jsons = list(DISTRICTS_DIR.glob("*.json"))
        print(f"  DISTRICTS_DIR has {len(jsons)} *.json files")
    else:
        print("  WARNING: DISTRICTS_DIR missing — KPI по областям будут fallback на country!")
    logging.info(
        "Paths: DATASET_PATH=%s DISTRICTS_DIR=%s RISK_SERVICE_URL=%s AI_SERVICE_URL=%s",
        DATASET_PATH, DISTRICTS_DIR, RISK_SERVICE_URL, AI_SERVICE_URL,
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

df = pd.read_csv(DATASET_PATH)

REGION_FILE_MAP: dict[str, str] = {
    "Toshkent sh.": "toshkent",
    "Toshkent viloyati": "toshkent",
    "Namangan viloyati": "namangan",
    "Farg'ona viloyati": "fargona",
    "Andijon viloyati": "andijon",
    "Sirdaryo viloyati": "sirdaryo",
    "Jizzax viloyati": "jizzax",
    "Navoiy viloyati": "navoiy",
    "Samarqand viloyati": "samarqand",
    "Qashqadaryo viloyati": "qashqadaryo",
    "Surxondaryo viloyati": "surxondaryo",
    "Buxoro viloyati": "buxoro",
    "Xorazm viloyati": "xorazm",
    "Qoraqalpogʻiston Respublikasi": "qoraqalpogiston",
}


def _normalize_name(value: str) -> str:
    v = str(value).lower()
    for ch in ["'", "ʻ", "ʼ", "`", "´"]:
        v = v.replace(ch, "'")
    v = "".join([c if c.isalnum() or c == " " else " " for c in v])
    return " ".join(v.split())


from functools import lru_cache

def _region_to_file_name(region_name: str) -> Optional[str]:
    """Сопоставление имени области с ключом REGION_FILE_MAP (с fallback по регистру)."""
    key = region_name.strip() if region_name else ""
    if not key:
        return None
    if key in REGION_FILE_MAP:
        return REGION_FILE_MAP[key]
    key_lower = key.lower()
    for k, v in REGION_FILE_MAP.items():
        if k.lower() == key_lower:
            return v
    return None


def _geom_centroid(geom: dict) -> Optional[tuple[float, float]]:
    """GeoJSON geometry -> (lon, lat) centroid (bbox center)."""
    if not geom or geom.get("type") == "Point":
        coords = geom.get("coordinates") if geom else None
        if coords and len(coords) >= 2:
            return (float(coords[0]), float(coords[1]))
        return None
    coords = geom.get("coordinates")
    if not coords:
        return None
    lons, lats = [], []
    def collect(c: Any) -> None:
        if isinstance(c, (int, float)):
            return
        if isinstance(c, (list, tuple)):
            if len(c) >= 2 and isinstance(c[0], (int, float)):
                lons.append(float(c[0]))
                lats.append(float(c[1]))
                return
            for x in c:
                collect(x)
    collect(coords)
    if not lons or not lats:
        return None
    return (sum(lons) / len(lons), sum(lats) / len(lats))


@lru_cache(maxsize=1)
def _load_all_district_centroids_cached() -> list[tuple[str, float, float]]:
    """Список (region_name, lat, lon) по всем районам из GeoJSON в DISTRICTS_DIR."""
    out: list[tuple[str, float, float]] = []
    if not DISTRICTS_DIR.exists():
        return out
    for path in sorted(DISTRICTS_DIR.glob("*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning("Failed to load %s: %s", path, e)
            continue
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            name_val = props.get("NAME_2") or props.get("NAME_3") or props.get("NAME_1") or props.get("name")
            if not name_val:
                continue
            geom = feature.get("geometry")
            cen = _geom_centroid(geom) if geom else None
            if cen:
                lon, lat = cen
                out.append((str(name_val), lat, lon))
    return out


def _nearest_district_name(center_lat: float, center_lng: float) -> Optional[str]:
    """Имя района (region_name), ближайшего к точке (center_lat, center_lng)."""
    points = _load_all_district_centroids_cached()
    if not points:
        return None
    best_name, best_d2 = None, float("inf")
    for name, lat, lon in points:
        d2 = (lat - center_lat) ** 2 + (lon - center_lng) ** 2
        if d2 < best_d2:
            best_d2 = d2
            best_name = name
    return best_name


@lru_cache(maxsize=64)
def _load_region_districts_cached(region_name: str) -> list[str]:
    file_name = _region_to_file_name(region_name)
    if not file_name:
        logger.warning("REGION_FILE_MAP has no key for region_name=%r; add to REGION_FILE_MAP", region_name)
        return []
    path = (DISTRICTS_DIR / f"{file_name}.json").resolve()
    if not path.exists():
        print(f"Districts file NOT FOUND: {path} (DISTRICTS_DIR={DISTRICTS_DIR})")
        logger.warning("Districts file not found: %s (DISTRICTS_DIR=%s)", path, DISTRICTS_DIR)
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    districts = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name_val = props.get("NAME_2") or props.get("NAME_3") or props.get("NAME_1") or props.get("name")
        if name_val:
            districts.append(str(name_val))
    return districts


def _safe_contains(series: pd.Series, value: str) -> pd.Series:
    return series.astype(str).str.contains(value, case=False, na=False)


def _risk_score_from_category(risk_category: str) -> float:
    mapping = {"High": 0.85, "Moderate_High": 0.7, "Moderate_Low": 0.5, "Low": 0.25}
    return mapping.get(risk_category, 0.5)


def _confidence_label(spread: float) -> str:
    if spread >= 10:
        return "High uncertainty (wide quantile spread)"
    if spread >= 5:
        return "Moderate uncertainty"
    return "Low uncertainty (tight quantile spread)"


def _features_to_json_safe(features: dict[str, Any]) -> dict[str, float]:
    """Заменяет np.nan и inf в features на 0.0 для JSON-сериализации."""
    result: dict[str, float] = {}
    for k, v in features.items():
        if v is None:
            result[k] = 0.0
        elif isinstance(v, (np.floating, np.integer)):
            result[k] = float(v) if np.isfinite(v) else 0.0
        elif isinstance(v, (int, float)):
            result[k] = 0.0 if not np.isfinite(v) else v
        else:
            try:
                fv = float(v)
                result[k] = fv if np.isfinite(fv) else 0.0
            except (TypeError, ValueError):
                result[k] = 0.0
    return result


def _fallback_ai_tips() -> list[str]:
    return [
        "Мониторить динамику урожайности по спутниковым данным.",
        "Учитывать спред квантилей (p10–p90) при решении о кредите.",
        "При отрицательной аномалии урожая рассмотреть страховку или резерв.",
    ]


def _pick_year(subset: pd.DataFrame, requested_year: int) -> Optional[int]:
    if "year" not in subset.columns or subset.empty:
        return None
    years = subset["year"].dropna().unique()
    if len(years) == 0:
        return None
    years = np.array(sorted([int(y) for y in years]))
    return int(years[np.argmin(np.abs(years - requested_year))])


def _select_nearest_year(subset: pd.DataFrame, requested_year: int) -> tuple[pd.DataFrame, Optional[int]]:
    if "year" not in subset.columns or subset.empty:
        return subset.iloc[0:0], None
    years = sorted({int(y) for y in subset["year"].dropna().unique()})
    if not years:
        return subset.iloc[0:0], None
    if requested_year in years:
        return subset[subset["year"] == requested_year], requested_year
    past_years = [y for y in years if y < requested_year]
    if not past_years:
        return subset.iloc[0:0], None
    used_year = max(past_years)
    return subset[subset["year"] == used_year], used_year


def _resolve_region_column(level: str, subset: pd.DataFrame) -> Optional[str]:
    if level == "oblast":
        if "oblast_name" in subset.columns:
            return "oblast_name"
        if "region_name" in subset.columns:
            logger.warning("Missing oblast_name column; falling back to region_name for oblast filter.")
            return "region_name"
    if level == "district":
        if "district_name" in subset.columns:
            return "district_name"
        if "region_name" in subset.columns:
            logger.warning("Missing district_name column; falling back to region_name for district filter.")
            return "region_name"
    return None


def _infer_oblast_from_district(subset: pd.DataFrame, district_name: Optional[str]) -> Optional[str]:
    if not district_name:
        return None
    if "district_name" in subset.columns and "oblast_name" in subset.columns:
        mask = subset["district_name"].astype(str).str.strip() == str(district_name).strip()
        if mask.any():
            return subset.loc[mask, "oblast_name"].dropna().astype(str).iloc[0]
    return None


def _filter_dataset(
    df: pd.DataFrame,
    country: str,
    region_level: str,
    region_id: Optional[str],
    crop: str,
    year: int,
) -> tuple[pd.DataFrame, dict]:
    subset = df
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]

    base_subset = subset
    fallback = "none"

    def _apply_level_filter(level: str, region_value: Optional[str]) -> pd.DataFrame:
        if level == "country":
            return base_subset
        if not region_value:
            return base_subset.iloc[0:0]
        # oblast: в датасете region_name = районы/города; фронт шлёт "Toshkent viloyati" — берём районы области из GeoJSON и фильтруем по ним
        if level == "oblast" and "region_name" in base_subset.columns:
            districts = _load_region_districts_cached(region_value)
            n_districts = len(districts)
            district_norms = {_normalize_name(d) for d in districts} if districts else set()
            names = base_subset["region_name"].fillna("").astype(str).map(_normalize_name)
            mask = names.isin(district_norms)
            n_matched = int(mask.sum())
            logger.warning(
                "KPI oblast filter: region_value=%r districts_loaded=%d matched_rows=%d (base_rows=%d)",
                region_value, n_districts, n_matched, len(base_subset),
            )
            if n_matched > 0:
                return base_subset[mask]
        # district: точное совпадение по region_name (или district_name, если есть)
        col = _resolve_region_column(level, base_subset)
        if not col:
            logger.warning("Missing column for level=%s; returning empty subset.", level)
            return base_subset.iloc[0:0]
        # для district допускаем и нормализованное совпадение (разные написания одного района)
        region_norm = _normalize_name(region_value)
        names_col = base_subset[col].fillna("").astype(str)
        exact = names_col.str.strip() == str(region_value).strip()
        if exact.any():
            return base_subset[exact]
        by_norm = names_col.map(_normalize_name) == region_norm
        if by_norm.any():
            return base_subset[by_norm]
        return base_subset.iloc[0:0]

    filtered = _apply_level_filter(region_level, region_id)
    filtered, used_year = _select_nearest_year(filtered, year)

    if filtered.empty:
        if region_level == "district":
            fallback = "oblast"
            oblast_name = _infer_oblast_from_district(base_subset, region_id)
            filtered = _apply_level_filter("oblast", oblast_name)
            filtered, used_year = _select_nearest_year(filtered, year)
            if filtered.empty:
                fallback = "country"
                print(f"KPI fallback: district->oblast->country (no data for region_id={region_id!r})")
                filtered = _apply_level_filter("country", None)
                filtered, used_year = _select_nearest_year(filtered, year)
        elif region_level == "oblast":
            fallback = "country"
            print(f"KPI fallback: oblast->country (no rows for region_id={region_id!r}; check DISTRICTS_DIR and district names)")
            filtered = _apply_level_filter("country", None)
            filtered, used_year = _select_nearest_year(filtered, year)

    meta = {
        "rows_used": int(len(filtered)),
        "year_used": int(used_year) if used_year is not None else None,
        "fallback": fallback,
        "data_confidence": "low" if fallback != "none" else "high",
    }
    return filtered, meta


def _apply_level_filter_no_year(
    base_subset: pd.DataFrame,
    level: str,
    region_value: Optional[str],
) -> pd.DataFrame:
    if level == "country":
        return base_subset
    if not region_value:
        return base_subset.iloc[0:0]
    if level == "oblast" and "region_name" in base_subset.columns:
        districts = _load_region_districts_cached(region_value)
        if districts:
            district_norms = {_normalize_name(d) for d in districts}
            names = base_subset["region_name"].fillna("").astype(str).map(_normalize_name)
            mask = names.isin(district_norms)
            if mask.any():
                return base_subset[mask]
    col = _resolve_region_column(level, base_subset)
    if not col:
        logger.warning("Missing column for level=%s; returning empty subset.", level)
        return base_subset.iloc[0:0]
    region_norm = _normalize_name(region_value)
    names_col = base_subset[col].fillna("").astype(str)
    exact = names_col.str.strip() == str(region_value).strip()
    if exact.any():
        return base_subset[exact]
    by_norm = names_col.map(_normalize_name) == region_norm
    if by_norm.any():
        return base_subset[by_norm]
    return base_subset.iloc[0:0]


def _get_baseline_df(
    country: str,
    region_level: str,
    region_id: Optional[str],
    crop: str,
    year_used: int,
) -> tuple[pd.DataFrame, dict]:
    """Baseline for satellite KPIs: same scope across years <= year_used (last 5 years)."""
    base_subset = df
    if "country_iso" in base_subset.columns:
        base_subset = base_subset[base_subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in base_subset.columns:
        base_subset = base_subset[base_subset["crop"].astype(str).str.lower() == crop.lower()]

    levels: list[str]
    if region_level == "district":
        levels = ["district", "oblast", "country"]
    elif region_level == "oblast":
        levels = ["oblast", "country"]
    else:
        levels = ["country"]

    baseline_meta = {"baseline_fallback": "none", "baseline_years_used": 0}
    for level in levels:
        scope_region = region_id
        if level == "oblast" and region_level == "district":
            scope_region = _infer_oblast_from_district(base_subset, region_id)
        scope_df = _apply_level_filter_no_year(base_subset, level, scope_region)
        if scope_df.empty or "year" not in scope_df.columns:
            continue
        scope_df = scope_df[scope_df["year"] <= year_used]
        if scope_df.empty:
            continue
        years = sorted({int(y) for y in scope_df["year"].dropna().unique()})
        if len(years) < 3:
            continue
        last_years = years[-5:]
        baseline_df = scope_df[scope_df["year"].isin(last_years)]
        baseline_meta = {
            "baseline_fallback": "none" if level == region_level else level,
            "baseline_years_used": len(last_years),
        }
        return baseline_df, baseline_meta

    return base_subset.iloc[0:0], baseline_meta


def _vegetation_health(
    df_year: pd.DataFrame,
    baseline_df: pd.DataFrame,
) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {}
    if "NDVI" not in df_year.columns or df_year["NDVI"].dropna().empty:
        meta["satellite_warning"] = "ndvi_missing"
        logger.warning("VEG_HEALTH: ndvi_missing (df_year cols=%s)", list(df_year.columns))
        return None, meta
    ndvi_current = float(df_year["NDVI"].mean())
    if "NDVI" not in baseline_df.columns or baseline_df.empty:
        meta["satellite_warning"] = "ndvi_baseline_missing"
        logger.warning("VEG_HEALTH: ndvi_baseline_missing (baseline len=%d)", len(baseline_df))
        return None, meta
    by_year = baseline_df.groupby("year", as_index=False)["NDVI"].mean()
    ndvi_vals = by_year["NDVI"].dropna().values
    if len(ndvi_vals) < 3:
        meta["satellite_warning"] = "ndvi_baseline_too_short"
        logger.warning("VEG_HEALTH: ndvi_baseline_too_short (n_years=%d)", len(ndvi_vals))
        return None, meta
    baseline_p10 = float(np.percentile(ndvi_vals, 10))
    baseline_p90 = float(np.percentile(ndvi_vals, 90))
    # Percentile rank: доля лет, где NDVI <= текущий — даёт вариацию 0..1 по регионам
    rank_count = int(np.sum(ndvi_vals <= ndvi_current))
    n_years = len(ndvi_vals)
    score = rank_count / n_years if ndvi_vals.size else 0.0
    score = float(max(0.0, min(1.0, score)))
    status = "good" if score >= 0.7 else "watch" if score >= 0.4 else "poor"
    logger.info(
        "VEG_HEALTH: ndvi_current=%.4f baseline_p10=%.4f p90=%.4f ndvi_vals=%s rank_count=%d n_years=%d score=%.3f status=%s",
        ndvi_current, baseline_p10, baseline_p90, [round(float(x), 4) for x in ndvi_vals], rank_count, n_years, score, status,
    )
    out: dict[str, Any] = {
        "value": round(score, 3),
        "status": status,
        "ndvi_current": round(ndvi_current, 4),
        "ndvi_baseline_p10": round(baseline_p10, 4),
        "ndvi_baseline_p90": round(baseline_p90, 4),
    }
    out["debug"] = {
        "formula": "rank_count / n_years (percentile rank)",
        "rank_count": rank_count,
        "n_years": n_years,
        "baseline_ndvi_by_year": [round(float(x), 4) for x in ndvi_vals],
    }
    return out, meta


def _season_stress(
    df_year: pd.DataFrame,
    baseline_df: pd.DataFrame,
    year_used: int,
    ndvi_current: Optional[float],
) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {}
    if df_year.empty:
        meta["satellite_warning"] = "season_year_empty"
        logger.warning("SEASON_STRESS: df_year empty")
        return None, meta

    # Непрерывные вклады 0..1, чтобы не получать везде 0
    drought_contrib = 0.0
    heat_contrib = 0.0
    ndvi_drop = 0
    precip_raw: Optional[float] = None
    temp_raw: Optional[float] = None
    ndvi_prev: Optional[float] = None

    if "precipitation_anomaly_mm" in df_year.columns and df_year["precipitation_anomaly_mm"].dropna().any():
        precip = float(df_year["precipitation_anomaly_mm"].mean())
        precip_raw = precip
        if precip < -50:
            drought_contrib = min(1.0, (-50 - precip) / 50.0)
        elif precip < 0:
            drought_contrib = min(0.5, -precip / 100.0)
    else:
        meta["satellite_warning"] = "precip_missing"
        logger.warning("SEASON_STRESS: precip_missing (cols=%s)", list(df_year.columns))

    if "temperature_mean_C" in df_year.columns and df_year["temperature_mean_C"].dropna().any():
        temp = float(df_year["temperature_mean_C"].mean())
        temp_raw = temp
        if temp > 25:
            heat_contrib = min(1.0, (temp - 25) / 10.0)
        elif temp > 22:
            heat_contrib = min(0.4, (temp - 22) / 10.0)
    else:
        meta["satellite_warning"] = "temp_missing"
        logger.warning("SEASON_STRESS: temp_missing")

    if not baseline_df.empty and "NDVI" in baseline_df.columns:
        prev_df = baseline_df[baseline_df["year"] == (year_used - 1)]
        if not prev_df.empty and prev_df["NDVI"].dropna().any():
            ndvi_prev = float(prev_df["NDVI"].mean())
    if ndvi_prev is None or ndvi_current is None:
        meta["ndvi_prev_missing"] = True
        ndvi_drop = 0
    else:
        ndvi_drop = 1 if ndvi_current < ndvi_prev * 0.85 else 0

    stress = 0.4 * drought_contrib + 0.3 * heat_contrib + 0.3 * float(ndvi_drop)
    stress = float(max(0.0, min(1.0, stress)))
    level = "low" if stress < 0.35 else "medium" if stress <= 0.65 else "high"
    logger.info(
        "SEASON_STRESS: precip=%s temp=%s ndvi_prev=%s ndvi_current=%s drought=%.3f heat=%.3f ndvi_drop=%s stress=%.3f level=%s",
        precip_raw, temp_raw, ndvi_prev, ndvi_current, drought_contrib, heat_contrib, ndvi_drop, stress, level,
    )
    out: dict[str, Any] = {
        "value": round(stress, 3),
        "level": level,
        "components": {
            "drought": round(drought_contrib, 3),
            "heat": round(heat_contrib, 3),
            "ndvi_drop": ndvi_drop,
        },
    }
    out["debug"] = {
        "formula": "0.4*drought + 0.3*heat + 0.3*ndvi_drop",
        "precip_raw": round(precip_raw, 2) if precip_raw is not None else None,
        "temp_raw": round(temp_raw, 2) if temp_raw is not None else None,
        "ndvi_prev": round(ndvi_prev, 4) if ndvi_prev is not None else None,
        "ndvi_current": round(ndvi_current, 4) if ndvi_current is not None else None,
        "drought_contrib": round(drought_contrib, 4),
        "heat_contrib": round(heat_contrib, 4),
        "ndvi_drop": ndvi_drop,
    }
    return out, meta


def _compute_features(df_region: pd.DataFrame, feature_cols: list[str]) -> dict[str, Any]:
    if df_region.empty:
        raise DegenerateFeaturesError("No rows available for feature computation.")
    if not feature_cols:
        raise DegenerateFeaturesError("Feature columns are empty.")
    available_cols = [c for c in feature_cols if c in df_region.columns]
    if not available_cols:
        raise DegenerateFeaturesError("No feature columns found in dataset.")
    stds = df_region[available_cols].std(numeric_only=True).fillna(0.0)
    low_var_count = int((stds < 1e-6).sum())
    # При одной строке или малом числе строк по району нулевая дисперсия ожидаема — не падаем, только лог
    if len(df_region) > 5 and low_var_count >= max(1, int(len(stds) * 0.6)):
        logger.warning(
            "Degenerate feature variance: rows=%d low_var_features=%d of %d; using means anyway.",
            len(df_region), low_var_count, len(stds),
        )
    means = df_region[available_cols].mean(numeric_only=True).to_dict()
    return {c: means.get(c, np.nan) for c in feature_cols}


def _chart_subset(country: str, crop: str, area_name: Optional[str], scope: str) -> pd.DataFrame:
    subset = df.copy()
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if area_name:
        area_norm = _normalize_name(area_name)
        if scope == "district" and "region_name" in subset.columns:
            names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
            mask = names == area_norm
            if mask.any():
                subset = subset[mask]
        elif scope == "region":
            districts = _load_region_districts_cached(area_name)
            if districts and "region_name" in subset.columns:
                district_norms = {_normalize_name(d) for d in districts}
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names.isin(district_norms)
                if mask.any():
                    subset = subset[mask]
        elif "region_id" in subset.columns:
            mask = _safe_contains(subset["region_id"], area_name)
            if mask.any():
                subset = subset[mask]
    if subset.empty:
        subset = df.copy()
        if "country_iso" in subset.columns:
            subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
        if "crop" in subset.columns:
            subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    return subset


def _get_chart_data(country: str, crop: str, area_name: Optional[str], scope: str) -> dict[str, Any]:
    subset = _chart_subset(country, crop, area_name, scope)
    if subset.empty:
        logger.info(
            "chart-data: no data for country=%r crop=%r scope=%r area_name=%r",
            country, crop, scope, area_name,
        )
        return {
            "ndviAnomalyTimeline": [],
            "riskDistribution": [],
            "precipVsVegetation": [],
        }
    logger.info(
        "chart-data: country=%r crop=%r scope=%r area_name=%r -> subset rows=%d",
        country, crop, scope, area_name, len(subset),
    )
    ndvi_anomaly_timeline: list[dict[str, Any]] = []
    if "year" in subset.columns:
        if "yield_anomaly_pct" in subset.columns:
            by_year = subset.groupby("year", as_index=False)["yield_anomaly_pct"].mean().reset_index()
            by_year = by_year.rename(columns={"yield_anomaly_pct": "anomaly"})
        elif "NDVI_anomaly" in subset.columns:
            by_year = subset.groupby("year", as_index=False)["NDVI_anomaly"].mean().reset_index()
            by_year["anomaly"] = (by_year["NDVI_anomaly"] * 100).round(1)
            by_year = by_year[["year", "anomaly"]]
        else:
            by_year = pd.DataFrame(columns=["year", "anomaly"])
        for _, row in by_year.sort_values("year").iterrows():
            ndvi_anomaly_timeline.append({"year": int(row["year"]), "anomaly": round(float(row["anomaly"]), 1), "baseline": 0})
    risk_distribution: list[dict[str, Any]] = []
    if "risk_category" in subset.columns:
        counts = subset["risk_category"].fillna("").astype(str).str.strip()
        low = int((counts.str.lower() == "low").sum())
        high = int(counts.str.lower().isin(["high", "moderate_high"]).sum())
        moderate = int(len(subset) - low - high)
        total = low + moderate + high
        if total > 0:
            risk_distribution = [
                {"name": "Low Risk", "value": round(100 * low / total), "color": "#10B981"},
                {"name": "Moderate Risk", "value": round(100 * moderate / total), "color": "#f59e0b"},
                {"name": "High Risk", "value": round(100 * high / total), "color": "#ef4444"},
            ]
    if not risk_distribution and "yield_anomaly_pct" in subset.columns:
        low = int((subset["yield_anomaly_pct"] > -5).sum())
        high = int((subset["yield_anomaly_pct"] < -15).sum())
        moderate = len(subset) - low - high
        total = low + moderate + high
        if total > 0:
            risk_distribution = [
                {"name": "Low Risk", "value": round(100 * low / total), "color": "#10B981"},
                {"name": "Moderate Risk", "value": round(100 * moderate / total), "color": "#f59e0b"},
                {"name": "High Risk", "value": round(100 * high / total), "color": "#ef4444"},
            ]
    precip_veg: list[dict[str, Any]] = []
    if "year" in subset.columns and "precipitation_total_mm" in subset.columns and "NDVI" in subset.columns:
        by_year = subset.groupby("year", as_index=False).agg(
            precipitation=("precipitation_total_mm", "mean"),
            ndvi=("NDVI", "mean"),
        )
        for _, row in by_year.sort_values("year").iterrows():
            precip_veg.append({
                "year": int(row["year"]),
                "precipitation": round(float(row["precipitation"]), 0),
                "ndvi": round(float(row["ndvi"]), 2),
            })
    return {
        "ndviAnomalyTimeline": ndvi_anomaly_timeline,
        "riskDistribution": risk_distribution,
        "precipVsVegetation": precip_veg,
    }


def _compute_features_for_scope(country: str, year: int, crop: str, area_name: Optional[str], scope: str) -> dict[str, Any]:
    subset = df.copy()
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if area_name:
        area_norm = _normalize_name(area_name)
        matched = False
        if scope == "district" and "region_name" in subset.columns:
            names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
            mask = names == area_norm
            if mask.any():
                subset = subset[mask]
                matched = True
        if scope == "region" and not matched:
            districts = _load_region_districts_cached(area_name)
            if districts and "region_name" in subset.columns:
                district_norms = {_normalize_name(d) for d in districts}
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names.isin(district_norms)
                if mask.any():
                    subset = subset[mask]
                    matched = True
        if not matched and "region_id" in subset.columns:
            mask = _safe_contains(subset["region_id"], area_name)
            if mask.any():
                subset = subset[mask]
    if subset.empty:
        subset = df.copy()
        if "country_iso" in subset.columns:
            subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
        if "crop" in subset.columns:
            subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
        if "year" in subset.columns and not subset.empty:
            nearest_year = _pick_year(subset, year)
            if nearest_year is not None:
                subset = subset[subset["year"] == nearest_year]
    if "year" in subset.columns and not subset.empty:
        nearest_year = _pick_year(subset, year)
        if nearest_year is not None:
            subset = subset[subset["year"] == nearest_year]
    if subset.empty:
        subset = df.copy()
    feature_cols = FEATURE_COLS or []
    available_cols = [c for c in feature_cols if c in subset.columns]
    means = subset[available_cols].mean(numeric_only=True).to_dict() if available_cols else {}
    feature_row = {c: means.get(c, np.nan) for c in feature_cols} if feature_cols else {}
    region_id = None
    if "region_id" in subset.columns and not subset["region_id"].dropna().empty:
        region_id = subset["region_id"].dropna().astype(str).iloc[0]
    return {
        "region_id": region_id or f"{country.upper()}_UNKNOWN",
        "year": int(year),
        "crop": crop.lower(),
        "features": feature_row,
    }


def _annual_debt_service(loan_per_ha: float, rate_pct: float, years: int) -> float:
    """Reference annual debt service for 1 ha (normalization for portfolio DSCR)."""
    r = rate_pct / 100 / 12
    n = int(years * 12)
    loan = loan_per_ha
    if r <= 0 or n <= 0:
        return loan / max(1, years)
    monthly = loan * (r * (1 + r) ** n) / ((1 + r) ** n - 1)
    return monthly * 12


def _dscr_from_yield_anomaly(
    pct: float,
    crop: str,
    loan_per_ha: float,
    rate_pct: float,
    years: int,
) -> float:
    """DSCR for 1 ha: predicted_yield = base_yield * (1 + pct/100), revenue = yield * price, NOI = revenue * (1 - cost_ratio), DSCR = NOI / annual_debt_service."""
    base_yield = BASE_YIELD_T_HA.get(crop.lower(), 3.0)
    price = PRICE_PER_TON.get(crop.lower(), 350.0)
    predicted_yield = base_yield * (1 + pct / 100)
    revenue = predicted_yield * 1.0 * price
    noi = revenue * (1 - COST_RATIO)
    annual_ds = _annual_debt_service(loan_per_ha, rate_pct, years)
    if annual_ds <= 0:
        return 0.0
    return round(noi / annual_ds, 2)


def _dscr_status(dscr_p50: float, dscr_p10: float) -> str:
    if dscr_p50 >= 1.25 and dscr_p10 >= 1.0:
        return "healthy"
    if dscr_p50 >= 1.0:
        return "borderline"
    return "stress"


def _risk_share_from_category(risk_category: str) -> dict[str, Any]:
    """One unit: return high/moderate/low as 0 or 100. method='single-region proxy' — не портфельная доля."""
    # TODO: replace with portfolio-weighted distribution when loans table exists
    cat = (risk_category or "").strip().lower()
    if cat == "high":
        return {"high": 100, "moderate": 0, "low": 0, "method": "single-region proxy"}
    if cat in ("moderate_high", "moderate_low"):
        return {"high": 0, "moderate": 100, "low": 0, "method": "single-region proxy"}
    return {"high": 0, "moderate": 0, "low": 100, "method": "single-region proxy"}


def _fetch_kpi_cards_uncached(
    country: str,
    region_level: str,
    region_id: Optional[str],
    crop: str,
    year: int,
) -> dict[str, Any]:
    """Compute KPI from Risk Service (single spatial unit). Response < 1s."""
    df_region, meta = _filter_dataset(df, country, region_level, region_id, crop, year)
    if meta["rows_used"] == 0 or meta["year_used"] is None:
        logger.warning(
            "KPI no data: country=%s level=%s region_id=%s crop=%s year=%s",
            country, region_level, region_id, crop, year
        )
        raise HTTPException(status_code=404, detail="No data for KPI selection")
    feature_cols = FEATURE_COLS or []
    features = _compute_features(df_region, feature_cols)
    available_cols = [c for c in feature_cols if c in df_region.columns]
    mean_std = float(df_region[available_cols].std(numeric_only=True).mean()) if available_cols else 0.0
    if mean_std < 1e-5 and meta.get("data_confidence") == "high":
        meta["data_confidence"] = "low"
    logger.info(
        "KPI features rows=%d year=%d mean_std=%.4f",
        meta["rows_used"],
        meta["year_used"],
        mean_std,
    )
    computed_region = None
    if "region_id" in df_region.columns and not df_region["region_id"].dropna().empty:
        computed_region = df_region["region_id"].dropna().astype(str).iloc[0]
    if not computed_region:
        computed_region = region_id if region_level != "country" else country
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        risk_resp = client.post(
            f"{RISK_SERVICE_URL}/predict",
            json={
                "region_id": computed_region,
                "year": meta["year_used"],
                "crop": crop.lower(),
                "features": _features_to_json_safe(features),
            },
        )
        risk_resp.raise_for_status()
        result = risk_resp.json()
    p50 = float(result["p50"])
    p10 = float(result["p10"])
    risk_category = str(result.get("risk_category", "Moderate_Low"))
    if abs(p50 - p10) <= 1e-3:
        logger.warning(
            "KPI p50≈p10 for region=%s level=%s crop=%s year=%s p50=%.4f p10=%.4f",
            region_id, region_level, crop, meta["year_used"], p50, p10
        )
    crop_lower = crop.lower()
    dscr_p50 = _dscr_from_yield_anomaly(
        p50, crop_lower, REFERENCE_LOAN_PER_HA, REFERENCE_RATE_PCT, int(REFERENCE_TERM_YEARS)
    )
    dscr_p10 = _dscr_from_yield_anomaly(
        p10, crop_lower, REFERENCE_LOAN_PER_HA, REFERENCE_RATE_PCT, int(REFERENCE_TERM_YEARS)
    )
    trend = "negative" if p50 < -2 else ("positive" if p50 > 2 else "neutral")
    scope_hash = "|".join([
        country.upper(),
        (region_id or "").strip() or "country",
        crop.lower(),
        str(meta["year_used"]),
    ])
    meta["scope_hash"] = scope_hash
    if dscr_p50 < 0.5 or dscr_p50 > 3.0:
        logger.warning(
            "KPI DSCR sanity: dscr_p50=%.2f outside [0.5, 3.0] for scope_hash=%s (check price/cost_ratio/yield)",
            dscr_p50, scope_hash,
        )
    logger.info(
        "KPI result: scope_hash=%s region=%s level=%s crop=%s p50=%.2f p10=%.2f dscr50=%.2f",
        scope_hash, region_id, region_level, crop, p50, p10, dscr_p50,
    )
    _kpi_scope_key = (country.upper(), crop_lower, int(meta["year_used"]), region_level)
    prev = _kpi_last_by_scope.get(_kpi_scope_key)
    if prev and prev[0] != (region_id or ""):
        prev_region, prev_p50, prev_dscr = prev
        if abs(prev_p50 - p50) <= 1e-6 and abs(prev_dscr - dscr_p50) <= 1e-6:
            logger.critical(
                "KPI identical across regions: prev_region=%s region=%s level=%s crop=%s year=%s p50=%.2f dscr50=%.2f",
                prev_region, region_id, region_level, crop, meta["year_used"], p50, dscr_p50
            )
    _kpi_last_by_scope[_kpi_scope_key] = (region_id or "", p50, dscr_p50)
    baseline_df, baseline_meta = _get_baseline_df(
        country=country,
        region_level=region_level,
        region_id=region_id,
        crop=crop,
        year_used=int(meta["year_used"]),
    )
    meta.update(baseline_meta)
    logger.info(
        "SAT_KPI baseline: scope_hash=%s baseline_rows=%d baseline_years=%d fallback=%s",
        scope_hash, int(len(baseline_df)), int(baseline_meta.get("baseline_years_used", 0)),
        baseline_meta.get("baseline_fallback", "none"),
    )
    if int(baseline_meta.get("baseline_years_used", 0)) < 3:
        raise HTTPException(status_code=404, detail="No satellite baseline available")

    vegetation_health, veg_meta = _vegetation_health(df_region, baseline_df)
    if vegetation_health is None:
        meta["data_confidence"] = "low"
    meta.update(veg_meta)
    ndvi_current = vegetation_health.get("ndvi_current") if vegetation_health else None
    season_stress, stress_meta = _season_stress(df_region, baseline_df, int(meta["year_used"]), ndvi_current)
    if season_stress is None:
        meta["data_confidence"] = "low"
    meta.update(stress_meta)
    logger.info(
        "SAT_KPI values: scope_hash=%s ndvi_cur=%s veg_score=%s stress=%s components=%s",
        scope_hash,
        vegetation_health.get("ndvi_current") if vegetation_health else None,
        vegetation_health.get("value") if vegetation_health else None,
        season_stress.get("value") if season_stress else None,
        season_stress.get("components") if season_stress else None,
    )
    if vegetation_health and "debug" in vegetation_health:
        logger.info("SAT_KPI veg debug: %s", vegetation_health["debug"])
    if season_stress and "debug" in season_stress:
        logger.info("SAT_KPI stress debug: %s", season_stress["debug"])
    prev_sat = _sat_kpi_last_by_scope.get(_kpi_scope_key)
    current_sat = (
        vegetation_health.get("value") if vegetation_health else None,
        season_stress.get("value") if season_stress else None,
    )
    if prev_sat and prev_sat[0] != (region_id or "") and (prev_sat[1], prev_sat[2]) == current_sat:
        logger.warning(
            "SAT_KPI identical across regions: scope_hash=%s prev_region=%s region=%s veg=%s stress=%s",
            scope_hash,
            prev_sat[0],
            region_id or "",
            current_sat[0],
            current_sat[1],
        )
    _sat_kpi_last_by_scope[_kpi_scope_key] = (
        region_id or "",
        current_sat[0],
        current_sat[1],
    )
    return {
        "yield_anomaly_p50": {"value": round(p50, 1), "unit": "%", "trend": trend},
        "downside_risk_p10": {"value": round(p10, 1), "unit": "%", "min_p10": round(p10, 1)},
        "portfolio_risk_share": _risk_share_from_category(risk_category),
        "dscr": {
            "p50": dscr_p50,
            "p10": dscr_p10,
            "status": _dscr_status(dscr_p50, dscr_p10),
        },
        "vegetation_health": vegetation_health,
        "season_stress": season_stress,
        "meta": meta,
    }


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "AgroAtlas Dashboard API",
        "docs": "/docs",
        "health": "/health",
        "health_dependencies": "/dashboard/health/dependencies",
        "metrics": "/dashboard/metrics",
        "kpi-cards": "/dashboard/kpi-cards",
        "recommend": "/dashboard/recommend",
        "explain-kpi": "/dashboard/explain-kpi",
        "kpi-explain": "/dashboard/kpi-explain",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/dashboard/health/dependencies")
def health_dependencies() -> dict[str, Any]:
    """
    Проверка доступности Risk и AI сервисов. Для диагностики в проде.
    Возвращает 200 всегда; смотрите risk_service/ai_service в теле ответа.
    """
    result: dict[str, Any] = {
        "risk_service": {"reachable": False, "url": RISK_SERVICE_URL, "error": None},
        "ai_service": {"reachable": False, "url": AI_SERVICE_URL, "error": None},
    }
    timeout = 3.0
    for name, url_key in [("risk_service", RISK_SERVICE_URL), ("ai_service", AI_SERVICE_URL)]:
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.get(f"{url_key}/health")
                result[name]["reachable"] = r.status_code == 200
                if r.status_code != 200:
                    result[name]["error"] = f"HTTP {r.status_code}"
        except Exception as e:
            result[name]["error"] = str(e)
    return result


@app.get("/dashboard/kpi-cards")
def dashboard_kpi_cards(
    country: str = Query("UZB"),
    region_level: str = Query("country", description="country | oblast | district"),
    region_id: Optional[str] = Query(None),
    crop: str = Query("wheat"),
    year: Optional[int] = Query(None),
) -> dict[str, Any]:
    """KPI-карточки для risk cockpit: yield anomaly p50, downside p10, portfolio risk share, DSCR. Без кэша — всегда пересчёт."""
    year = year or int(__import__("datetime").datetime.now().year)
    try:
        return _fetch_kpi_cards_uncached(country, region_level, region_id, crop, year)
    except httpx.HTTPError as e:
        logging.warning("KPI Risk service error: %s", e)
        raise HTTPException(status_code=503, detail="Risk service unavailable") from e
    except Exception as exc:
        logging.exception("kpi-cards error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/dashboard/chart-data")
def dashboard_chart_data(
    country: str = Query("UZB"),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
) -> dict[str, Any]:
    try:
        return _get_chart_data(
            country=country,
            crop=crop,
            area_name=area_name if scope != "country" else None,
            scope=scope,
        )
    except Exception as exc:
        logging.exception("chart-data error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# Ключевые колонки для экспорта исторических данных (~10 штук)
HISTORICAL_CSV_COLUMNS = [
    "year",
    "region_name",
    "region_id",
    "crop",
    "NDVI",
    "NDVI_anomaly",
    "precipitation_total_mm",
    "precipitation_anomaly_mm",
    "temperature_mean_C",
    "drought_proxy",
    "heat_stress_days_proxy",
    "yield_anomaly_pct",
]


@app.get("/dashboard/historical-csv", response_class=Response)
def dashboard_historical_csv(
    country: str = Query("UZB"),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
    center_lat: Optional[float] = Query(None, description="Latitude of drawn area center; filter by nearest district"),
    center_lng: Optional[float] = Query(None, description="Longitude of drawn area center"),
    year_from: Optional[int] = Query(None, description="Start year (inclusive)"),
    year_to: Optional[int] = Query(None, description="End year (inclusive)"),
) -> Response:
    """CSV с историческими данными для выбранного scope. Если заданы center_lat/center_lng — только ближайший район."""
    subset = df
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if center_lat is not None and center_lng is not None:
        nearest = _nearest_district_name(center_lat, center_lng)
        if nearest and "region_name" in subset.columns:
            subset = subset[subset["region_name"].fillna("").astype(str).map(_normalize_name) == _normalize_name(nearest)]
        # если nearest is None (нет GeoJSON или пустой список) — не фильтруем, отдаём по стране/культуре
    elif scope != "country" and area_name:
        subset = _apply_level_filter_no_year(subset, scope, area_name)
    if subset.empty:
        raise HTTPException(status_code=404, detail="No data for the selected scope")
    if "year" in subset.columns:
        y_min = int(subset["year"].min())
        y_max = int(subset["year"].max())
        y_from = year_from if year_from is not None else y_min
        y_to = year_to if year_to is not None else y_max
        subset = subset[(subset["year"] >= y_from) & (subset["year"] <= y_to)]
    available = [c for c in HISTORICAL_CSV_COLUMNS if c in subset.columns]
    out_df = subset[available].drop_duplicates().sort_values(by=["year", "region_name"] if "region_name" in available else ["year"])
    csv_bytes = out_df.to_csv(index=False).encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=historical_data.csv"},
    )


@app.get("/dashboard/model-card")
def dashboard_model_card() -> dict[str, Any]:
    """Метрики надёжности модели для отчёта: coverage, downside miss rate, MAE/RMSE, baseline years."""
    return {
        **MODEL_METRICS,
        "baseline_years": BASELINE_YEARS,
    }


def _parse_bbox_query(bbox: Optional[str]) -> Optional[list[float]]:
    """Query bbox: 'minLng,minLat,maxLng,maxLat' -> [min_lon, min_lat, max_lon, max_lat]."""
    if not bbox:
        return None
    parts = [p.strip() for p in bbox.split(",")]
    if len(parts) != 4:
        return None
    try:
        return [float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])]
    except ValueError:
        return None


def _parse_polygon_query(polygon: Optional[str]) -> Optional[list[list[float]]]:
    """Query polygon: JSON array of [lat,lng]. Decode once in case of double-encoded query param."""
    if not polygon:
        return None
    raw = unquote(polygon)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, list) or not data:
        return None
    out = []
    for item in data:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            out.append([float(item[0]), float(item[1])])
    return out if len(out) >= 3 else None


@app.get("/dashboard/satellite/timelapse")
def dashboard_satellite_timelapse(
    country: str = Query("UZB"),
    region_level: str = Query("country"),
    region_id: Optional[str] = Query(None),
    crop: str = Query("cotton"),
    year: int = Query(2024, ge=2017, le=2030),
    product: str = Query("truecolor"),
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat"),
    polygon: Optional[str] = Query(None, description="JSON array of [lat,lng] points"),
) -> dict[str, Any]:
    """Returns { year_used, years: [{year, imageUrl, ...}], baseline: {imageUrl, yearsUsed} }. Credentials in env (CDS_*)."""
    from satellite import bbox_from_polygon, timelapse_response

    polygon_list = _parse_polygon_query(polygon)
    bbox_list = _parse_bbox_query(bbox)
    if polygon_list:
        bbox_list = bbox_from_polygon(polygon_list)
    elif bbox_list:
        pass
    else:
        return {
            "year_used": year,
            "years": [],
            "baseline": {"imageUrl": None, "yearsUsed": []},
            "error": "Provide bbox or polygon",
        }
    # timelapse_response expects polygon for bbox_from_polygon; we pass a fake polygon from bbox
    fake_polygon = [
        [bbox_list[1], bbox_list[0]],
        [bbox_list[1], bbox_list[2]],
        [bbox_list[3], bbox_list[2]],
        [bbox_list[3], bbox_list[0]],
    ]
    return timelapse_response(fake_polygon, country, region_level, region_id, crop, year, product)


@app.get("/dashboard/satellite/preview")
def dashboard_satellite_preview(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    product: str = Query("truecolor"),
    bbox: Optional[str] = Query(None),
    polygon: Optional[str] = Query(None),
) -> dict[str, Any]:
    """Returns { imageUrl, compositeWindow, source, cloudHint }. Backend uses env credentials only."""
    from satellite import bbox_from_polygon, preview_response

    polygon_list = _parse_polygon_query(polygon)
    bbox_list = _parse_bbox_query(bbox)
    if polygon_list:
        bbox_list = bbox_from_polygon(polygon_list)
    elif not bbox_list:
        raise HTTPException(status_code=400, detail="Provide bbox or polygon")
    else:
        polygon_list = [
            [bbox_list[1], bbox_list[0]],
            [bbox_list[1], bbox_list[2]],
            [bbox_list[3], bbox_list[2]],
            [bbox_list[3], bbox_list[0]],
        ]
    return preview_response(polygon_list, date_from, date_to, product)


@app.get("/dashboard/metrics")
def dashboard_metrics(
    country: str = Query("UZB"),
    year: int = Query(2024),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
    lang: Optional[str] = Query("en"),
) -> dict[str, Any]:
    try:
        payload = _compute_features_for_scope(country, year, crop, area_name if scope != "country" else None, scope)
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            try:
                risk_resp = client.post(
                    f"{RISK_SERVICE_URL}/predict",
                    json={
                        "region_id": payload["region_id"],
                        "year": payload["year"],
                        "crop": payload["crop"],
                        "features": _features_to_json_safe(payload["features"]),
                    },
                )
                risk_resp.raise_for_status()
                result = risk_resp.json()
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                logging.warning("Risk service unavailable: %s", e)
                raise HTTPException(status_code=503, detail="Risk service unavailable") from e
        p10 = float(result["p10"])
        p50 = float(result["p50"])
        p90 = float(result["p90"])
        spread = float(result["spread"])
        risk_category = str(result["risk_category"])
        risk_score = _risk_score_from_category(risk_category)
        base_exposure = 10_000_000
        loss_fraction = max(0.05, min(0.35, abs(p10) / 100))
        value_at_risk = f"${base_exposure * loss_fraction / 1_000_000:.1f}M"
        ai_tips: list[str]
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            try:
                tips_resp = client.post(
                    f"{AI_SERVICE_URL}/tips",
                    json={
                        "country": country,
                        "year": year,
                        "crop": crop,
                        "risk_score": risk_score,
                        "p50": p50,
                        "p10": p10,
                        "p90": p90,
                        "spread": spread,
                        "risk_category": risk_category,
                        "lang": lang or "en",
                    },
                )
                tips_resp.raise_for_status()
                ai_tips = tips_resp.json().get("tips", _fallback_ai_tips())
            except (httpx.HTTPError, httpx.TimeoutException):
                ai_tips = _fallback_ai_tips()
        return {
            "riskScore": risk_score,
            "valueAtRisk": value_at_risk,
            "yieldAnomaly": f"{p50:.1f}%",
            "p10": p10,
            "p50": p50,
            "p90": p90,
            "spread": spread,
            "confidenceLabel": _confidence_label(spread),
            "riskCategory": risk_category,
            "aiTips": ai_tips,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("metrics error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/dashboard/predict")
def dashboard_predict(req: PredictRequest) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(
                f"{RISK_SERVICE_URL}/predict",
                json=req.model_dump(),
            )
            resp.raise_for_status()
            result = resp.json()
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        logging.warning("Risk service error: %s", e)
        raise HTTPException(status_code=503, detail="Risk service unavailable") from e
    risk_category = str(result["risk_category"])
    spread = float(result["spread"])
    return {
        "p10": result["p10"],
        "p50": result["p50"],
        "p90": result["p90"],
        "spread": spread,
        "riskCategory": risk_category,
        "riskScore": _risk_score_from_category(risk_category),
        "confidenceLabel": _confidence_label(spread),
    }


@app.post("/dashboard/recommend")
def dashboard_recommend(req: RegionDataRequest) -> dict[str, Any]:
    body = req.model_dump()
    if req.year is None:
        from datetime import datetime
        body["year"] = datetime.now().year
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(f"{AI_SERVICE_URL}/recommend", json=body)
            resp.raise_for_status()
            data = resp.json()
        return {
            "riskAssessment": data.get("riskAssessment", ""),
            "immediateActions": data.get("immediateActions", ""),
            "seasonalOutlook": data.get("seasonalOutlook", ""),
            "resourceOptimization": data.get("resourceOptimization", ""),
            "raw": data.get("raw", ""),
        }
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        logging.warning("AI service error: %s", e)
        raise HTTPException(status_code=503, detail="AI service unavailable") from e


KPI_EXPLAIN_MAX_BODY = 1_000_000
KPI_EXPLAIN_TIMEOUT = 120.0


def _scope_hash(scope: Any) -> str:
    s = getattr(scope, "country", "") or ""
    s += "|" + (getattr(scope, "region_id", None) or "")
    s += "|" + (getattr(scope, "crop", "") or "")
    s += "|" + str(getattr(scope, "year", ""))
    return s


@app.post("/dashboard/kpi-explain")
def dashboard_kpi_explain(req: KpiExplainRequest) -> dict[str, Any]:
    """
    Structured KPI explanation: proxy to AI Service.
    Validates kpi_group and kpi_key; returns strict JSON UI schema from AI.
    """
    if req.kpi_group not in KPI_GROUP_VALUES:
        raise HTTPException(status_code=422, detail=f"Invalid kpi_group: {req.kpi_group}")
    allowed_keys = KPI_KEY_FINANCE if req.kpi_group == "finance" else KPI_KEY_SATELLITE
    if req.kpi_key not in allowed_keys:
        raise HTTPException(status_code=422, detail=f"Invalid kpi_key for {req.kpi_group}: {req.kpi_key}")

    scope_hash = _scope_hash(req.scope)
    request_id = str(uuid.uuid4())
    year_used = (req.meta and getattr(req.meta, "year_used", None)) or req.scope.year
    confidence = (req.meta and getattr(req.meta, "data_confidence", None)) or "high"
    logger.info(
        "kpi-explain request_id=%s scope_hash=%s kpi_key=%s year_used=%s confidence=%s",
        request_id, scope_hash, req.kpi_key, year_used, confidence,
    )

    body = {
        "request_id": request_id,
        "kpi_group": req.kpi_group,
        "kpi_key": req.kpi_key,
        "scope": req.scope.model_dump(),
        "kpi_values": req.kpi_values,
        "meta": req.meta.model_dump() if req.meta else {},
    }

    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=KPI_EXPLAIN_TIMEOUT) as client:
                resp = client.post(
                    f"{AI_SERVICE_URL}/explain-kpi-structured",
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
            logger.info("kpi-explain request_id=%s success latency_ok", request_id)
            return data
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            last_error = e
            logger.warning("kpi-explain request_id=%s attempt=%s error=%s", request_id, attempt + 1, e)
    raise HTTPException(status_code=503, detail="AI service unavailable") from last_error


@app.post("/dashboard/explain-kpi")
def dashboard_explain_kpi(req: ExplainKpiRequest) -> dict[str, Any]:
    metrics = {
        "language": req.language,
        "location": req.location,
        "valueAtRisk": req.valueAtRisk,
        "riskScore": req.riskScore,
        "yieldAnomaly": req.yieldAnomaly,
        "p10": req.p10,
        "p50": req.p50,
        "p90": req.p90,
        "spread": req.spread,
        "confidenceLabel": req.confidenceLabel,
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(
                f"{AI_SERVICE_URL}/explain-kpi",
                json={"cardId": req.cardId, **metrics},
            )
            resp.raise_for_status()
            data = resp.json()
        return {"explanation": data.get("explanation", ""), "isMock": data.get("isMock", False)}
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        logging.warning("AI service error: %s", e)
        raise HTTPException(status_code=503, detail="AI service unavailable") from e
