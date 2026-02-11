"""
DTO для Dashboard Service — контракты API и валидация.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ----- Predict (прокси к Risk Service) -----

class PredictRequest(BaseModel):
    """Тело запроса для POST /dashboard/predict (передаётся в Risk Service)."""
    region_id: str = Field(..., min_length=1, max_length=100)
    year: int = Field(..., ge=2000, le=2100)
    crop: str = Field(..., min_length=1, max_length=50)
    features: dict[str, float] = Field(default_factory=dict)


# ----- Recommend (прокси к AI Service) -----

class RegionDataRequest(BaseModel):
    """Тело запроса для POST /dashboard/recommend (передаётся в AI Service)."""
    region_name: str = Field(..., min_length=1, max_length=200)
    country: Optional[str] = Field("Uzbekistan", max_length=100)
    crop: Optional[str] = Field("cotton", max_length=50)
    year: Optional[int] = Field(None, ge=2000, le=2100)
    risk_category: Optional[str] = Field("Moderate", max_length=50)
    NDVI: Optional[float] = Field(0.5, ge=0.0, le=1.0)
    NDVI_anomaly: Optional[float] = Field(0.0)
    NDVI_slope: Optional[float] = Field(0.0)
    precipitation_total_mm: Optional[float] = Field(300.0, ge=0.0)
    precipitation_anomaly_mm: Optional[float] = Field(0.0)
    temperature_mean_C: Optional[float] = Field(25.0, ge=-50.0, le=60.0)
    drought_proxy: Optional[int] = Field(0, ge=0, le=1)
    heat_stress_days_proxy: Optional[int] = Field(0, ge=0, le=365)
    elevation: Optional[float] = Field(400.0, ge=0.0)
    slope: Optional[float] = Field(2.0, ge=0.0)
    predictedYield: Optional[float] = Field(None, ge=0.0)
    yieldAnomaly: Optional[float] = None
    htcIndex: Optional[float] = Field(None, ge=0.0, le=2.0)
    dscr: Optional[float] = Field(None, ge=0.0)
    loanAmount: Optional[float] = Field(None, ge=0.0)
    language: Optional[str] = Field("en", max_length=5)


# ----- Explain KPI (прокси к AI Service) -----

class ExplainKpiRequest(BaseModel):
    """Тело запроса для POST /dashboard/explain-kpi (legacy)."""
    cardId: Literal["portfolio", "yield", "confidence"]
    language: Optional[str] = Field("en", max_length=5)
    location: Optional[str] = Field(None, max_length=200)
    valueAtRisk: Optional[str] = None
    riskScore: Optional[float] = Field(None, ge=0.0, le=1.0)
    yieldAnomaly: Optional[str] = None
    p10: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    spread: Optional[float] = Field(None, ge=0.0)
    confidenceLabel: Optional[str] = None


# ----- KPI Explain (structured JSON, POST /dashboard/kpi-explain) -----

KPI_GROUP_VALUES = ("finance", "satellite")
KPI_KEY_FINANCE = ("yield_anomaly", "downside_risk", "high_risk_share", "dscr")
KPI_KEY_SATELLITE = ("vegetation_health", "season_stress")
KPI_KEY_VALUES = (*KPI_KEY_FINANCE, *KPI_KEY_SATELLITE)


class KpiExplainScope(BaseModel):
    country: str = Field(..., min_length=1, max_length=10)
    region_level: Literal["country", "oblast", "district"] = "country"
    region_id: Optional[str] = Field(None, max_length=200)
    crop: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=2000, le=2100)


class KpiExplainMeta(BaseModel):
    rows_used: Optional[int] = None
    year_used: Optional[int] = None
    fallback: Optional[Literal["none", "oblast", "country"]] = None
    data_confidence: Optional[Literal["high", "low"]] = None


class KpiExplainRequest(BaseModel):
    """Тело запроса для POST /dashboard/kpi-explain (structured explain → AI)."""
    kpi_group: Literal["finance", "satellite"] = Field(...)
    kpi_key: str = Field(..., min_length=1, max_length=50)
    scope: KpiExplainScope = Field(...)
    kpi_values: dict[str, Any] = Field(default_factory=dict)
    meta: Optional[KpiExplainMeta] = Field(default_factory=KpiExplainMeta)
