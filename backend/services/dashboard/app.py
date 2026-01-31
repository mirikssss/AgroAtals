from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import json
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
DEPLOYMENT_DIR = Path(os.environ.get("DEPLOYMENT_DIR", BACKEND_DIR / "deployment"))
DATASET_PATH = Path(os.environ.get("DATASET_PATH", DEPLOYMENT_DIR / "dataset.csv"))
DISTRICTS_DIR = Path(os.environ.get("DISTRICTS_DIR", PROJECT_ROOT / "public" / "districts"))

if not DEPLOYMENT_DIR.exists():
    raise RuntimeError(f"Deployment directory not found: {DEPLOYMENT_DIR}")
if not DATASET_PATH.exists():
    raise RuntimeError(f"Dataset file not found: {DATASET_PATH}")

os.environ.setdefault("NUMEXPR_MAX_THREADS", "8")

import sys  # noqa: E402

sys.path.append(str(DEPLOYMENT_DIR))
from inference import RiskScorer  # type: ignore  # noqa: E402


app = FastAPI(title="AgroAtlas Dashboard Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scorer = RiskScorer(DEPLOYMENT_DIR)
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
    for ch in ["’", "ʻ", "ʼ", "`", "´"]:
        v = v.replace(ch, "'")
    v = "".join([c if c.isalnum() or c == " " else " " for c in v])
    v = " ".join(v.split())
    return v


@lru_cache(maxsize=64)
def _load_region_districts(region_name: str) -> list[str]:
    file_name = REGION_FILE_MAP.get(region_name)
    if not file_name:
        return []
    path = DISTRICTS_DIR / f"{file_name}.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    districts: list[str] = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name = props.get("NAME_2") or props.get("NAME_3") or props.get("NAME_1") or props.get("name")
        if name:
            districts.append(str(name))
    return districts


def _safe_contains(series: pd.Series, value: str) -> pd.Series:
    return series.astype(str).str.contains(value, case=False, na=False)


def _risk_score_from_category(risk_category: str) -> float:
    mapping = {
        "High": 0.85,
        "Moderate_High": 0.7,
        "Moderate_Low": 0.5,
        "Low": 0.25,
    }
    return mapping.get(risk_category, 0.5)


def _confidence_label(spread: float) -> str:
    if spread >= 10:
        return "High uncertainty (wide quantile spread)"
    if spread >= 5:
        return "Moderate uncertainty"
    return "Low uncertainty (tight quantile spread)"


def _pick_year(subset: pd.DataFrame, requested_year: int) -> Optional[int]:
    if "year" not in subset.columns or subset.empty:
        return None
    years = subset["year"].dropna().unique()
    if len(years) == 0:
        return None
    years = np.array(sorted([int(y) for y in years]))
    return int(years[np.argmin(np.abs(years - requested_year))])


def _compute_features(country: str, year: int, crop: str, area_name: Optional[str], scope: str) -> dict[str, Any]:
    subset = df.copy()
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "year" in subset.columns:
        pass
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if area_name:
        matched = False
        area_norm = _normalize_name(area_name)
        if scope == "district":
            if "region_name" in subset.columns:
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names == area_norm
                if mask.any():
                    subset = subset[mask]
                    matched = True
        if scope == "region":
            districts = _load_region_districts(area_name)
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

    available_cols = [c for c in scorer.feature_cols if c in subset.columns]
    means = subset[available_cols].mean(numeric_only=True).to_dict() if available_cols else {}
    feature_row = {c: means.get(c, np.nan) for c in scorer.feature_cols}
    region_id = None
    if "region_id" in subset.columns:
        region_id = subset["region_id"].dropna().astype(str).iloc[0] if not subset["region_id"].dropna().empty else None

    return {
        "region_id": region_id or f"{country.upper()}_UNKNOWN",
        "year": int(year),
        "crop": crop.lower(),
        "features": feature_row,
    }


class PredictRequest(BaseModel):
    region_id: str
    year: int
    crop: str
    features: dict[str, float]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/dashboard/metrics")
def dashboard_metrics(
    country: str = Query("UZB"),
    year: int = Query(2024),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
) -> dict[str, Any]:
    try:
        payload = _compute_features(country, year, crop, area_name if scope != "country" else None, scope)
        result = scorer.predict_single(
            region_id=payload["region_id"],
            year=payload["year"],
            crop=payload["crop"],
            features=payload["features"],
        )
        p10 = float(result["p10"])
        p50 = float(result["p50"])
        p90 = float(result["p90"])
        spread = float(result["spread"])
        risk_category = str(result["risk_category"])
        risk_score = _risk_score_from_category(risk_category)

        base_exposure = 10_000_000
        loss_fraction = max(0.05, min(0.35, abs(p10) / 100))
        value_at_risk = f"${base_exposure * loss_fraction / 1_000_000:.1f}M"

        return {
            "riskScore": risk_score,
            "valueAtRisk": value_at_risk,
            "yieldAnomaly": f"{p50:.1f}%",
            "p10": p10,
            "p50": p50,
            "p90": p90,
            "spread": spread,
            "confidenceLabel": _confidence_label(spread),
        }
    except Exception as exc:
        print(f"[dashboard/metrics] error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/dashboard/predict")
def dashboard_predict(req: PredictRequest) -> dict[str, Any]:
    result = scorer.predict_single(
        region_id=req.region_id,
        year=req.year,
        crop=req.crop,
        features=req.features,
    )
    p10 = float(result["p10"])
    p50 = float(result["p50"])
    p90 = float(result["p90"])
    spread = float(result["spread"])
    risk_category = str(result["risk_category"])
    return {
        "p10": p10,
        "p50": p50,
        "p90": p90,
        "spread": spread,
        "riskCategory": risk_category,
        "riskScore": _risk_score_from_category(risk_category),
        "confidenceLabel": _confidence_label(spread),
    }
