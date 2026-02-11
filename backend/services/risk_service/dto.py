"""
DTO для Risk Service — предсказание риска урожая (квантили p10/p50/p90, категория риска).
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    """Запрос на предсказание риска для одного региона/года/культуры."""
    region_id: str = Field(..., min_length=1, max_length=100)
    year: int = Field(..., ge=2000, le=2100)
    crop: str = Field(..., min_length=1, max_length=50)
    features: dict[str, float] = Field(default_factory=dict)


class PredictResponse(BaseModel):
    """Ответ модели: квантили, категория риска, спред."""
    region_id: str
    year: int
    crop: str
    p10: float = Field(..., description="10-й перцентиль (пессимистичный сценарий)")
    p50: float = Field(..., description="Медиана прогноза аномалии урожая %")
    p90: float = Field(..., description="90-й перцентиль (оптимистичный сценарий)")
    spread: float = Field(..., ge=0.0, description="p90 - p10")
    risk_category: str = Field(..., description="High | Moderate_High | Moderate_Low | Low")
