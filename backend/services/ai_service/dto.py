"""
DTO (Data Transfer Objects) для AI Service.
Валидация входных данных и типизированные ответы для безопасности и контракта API.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ----- Tips (для dashboard metrics) -----

class TipsRequest(BaseModel):
    """Запрос на генерацию коротких советов по риску для кредитного офицера."""
    country: str = Field(..., min_length=1, max_length=10)
    year: int = Field(..., ge=2000, le=2100)
    crop: str = Field(..., min_length=1, max_length=50)
    risk_score: float = Field(..., ge=0.0, le=1.0)
    p50: float = Field(...)
    p10: float = Field(...)
    p90: float = Field(...)
    spread: float = Field(..., ge=0.0)
    risk_category: str = Field(..., max_length=50)
    lang: str = Field(default="en", max_length=5)


class TipsResponse(BaseModel):
    """Список коротких AI-советов (3–5 пунктов)."""
    tips: list[str] = Field(..., max_length=10)


# ----- Recommend (агро-рекомендация по региону) -----

class RegionDataRequest(BaseModel):
    """Данные региона для агро-рекомендации (кредитный советник)."""
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


class RecommendResponse(BaseModel):
    """Структурированная агро-рекомендация от ИИ."""
    riskAssessment: str = Field("")
    immediateActions: str = Field("")
    seasonalOutlook: str = Field("")
    resourceOptimization: str = Field("")
    raw: str = Field("")
    is_mock: bool = Field(default=False, description="True если использован fallback без Gemini")


# ----- Explain KPI -----

class ExplainKpiRequest(BaseModel):
    """Запрос на объяснение KPI карточки дашборда."""
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


class ExplainKpiResponse(BaseModel):
    """Объяснение KPI от ИИ (legacy)."""
    explanation: str = Field(...)
    isMock: bool = Field(default=False)


# ----- Structured KPI Explain (POST /explain-kpi with kpi_group/scope) -----

class ExplainKpiStructuredScope(BaseModel):
    country: str = Field(..., max_length=10)
    region_level: Literal["country", "oblast", "district"] = "country"
    region_id: Optional[str] = Field(None, max_length=200)
    crop: str = Field(..., max_length=50)
    year: int = Field(..., ge=2000, le=2100)


class ExplainKpiStructuredMeta(BaseModel):
    rows_used: Optional[int] = None
    year_used: Optional[int] = None
    fallback: Optional[Literal["none", "oblast", "country"]] = None
    data_confidence: Optional[Literal["high", "low"]] = None


class ExplainKpiStructuredRequest(BaseModel):
    """Запрос на структурированное объяснение KPI (JSON UI)."""
    request_id: Optional[str] = Field(None, max_length=64)
    kpi_group: Literal["finance", "satellite"]
    kpi_key: str = Field(..., max_length=50)
    scope: ExplainKpiStructuredScope
    kpi_values: dict[str, Any] = Field(default_factory=dict)
    meta: Optional[ExplainKpiStructuredMeta] = None


# Response schema: strict JSON for frontend renderer
class BadgeItem(BaseModel):
    label: str = Field("")
    tone: Literal["neutral", "good", "warning", "danger"] = "neutral"


class HeroBlock(BaseModel):
    headline: str = Field("")
    summary: str = Field("")


class MetricItem(BaseModel):
    label: str = Field("")
    value: str = Field("")
    unit: Optional[str] = None
    tone: Literal["neutral", "good", "warning", "danger"] = "neutral"
    note: Optional[str] = None


class SectionBlock(BaseModel):
    heading: str = Field("")
    bullets: list[str] = Field(default_factory=list)


class TableBlock(BaseModel):
    title: str = Field("")
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class ConfidenceBlock(BaseModel):
    level: Literal["high", "low"] = "high"
    reason: str = Field("")
    limitations: list[str] = Field(default_factory=list)


class NextActionItem(BaseModel):
    priority: Literal["P0", "P1", "P2"] = "P1"
    action: str = Field("")
    why: str = Field("")


class ExplainKpiStructuredResponse(BaseModel):
    title: str = Field("")
    subtitle: str = Field("")
    badges: list[BadgeItem] = Field(default_factory=list)
    hero: Optional[HeroBlock] = None
    metrics: list[MetricItem] = Field(default_factory=list)
    sections: list[SectionBlock] = Field(default_factory=list)
    table: Optional[TableBlock] = None
    confidence: Optional[ConfidenceBlock] = None
    next_actions: list[NextActionItem] = Field(default_factory=list)
    disclaimer: str = Field("")
