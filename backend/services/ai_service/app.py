"""
AI Microservice — агро-рекомендации и объяснения KPI через Gemini API.
Эндпоинты: POST /tips, POST /recommend, POST /explain-kpi.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from dto import (
    ExplainKpiRequest,
    ExplainKpiResponse,
    ExplainKpiStructuredRequest,
    RegionDataRequest,
    RecommendResponse,
    TipsRequest,
    TipsResponse,
)
from gemini_service import explain_kpi, explain_kpi_structured, get_recommendation, get_tips

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # cleanup if needed


app = FastAPI(
    title="AgroAtlas AI Service",
    version="1.0.0",
    description="Микросервис ИИ: советы по рискам, агро-рекомендации, объяснения KPI (Gemini).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {
        "service": "AgroAtlas AI Service",
        "docs": "/docs",
        "health": "/health",
        "endpoints": ["POST /tips", "POST /recommend", "POST /explain-kpi", "POST /explain-kpi-structured"],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/env-check")
def env_check() -> dict[str, str | bool]:
    """
    Диагностика: проверка переменных окружения без раскрытия секретов.
    Вызови: curl https://твой-ai-service.onrender.com/env-check
    """
    import os
    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    model = (os.environ.get("GEMINI_MODEL") or "not set (default used)").strip()
    return {
        "GEMINI_API_KEY_set": bool(len(key) > 0),
        "GEMINI_MODEL": model if model else "not set",
    }


@app.post("/tips", response_model=TipsResponse)
def api_tips(req: TipsRequest) -> TipsResponse:
    """
    Генерация 3–5 коротких советов для метрик дашборда (риск, урожай, спред).
    При недоступности Gemini возвращается fallback-список.
    """
    try:
        tips = get_tips(
            country=req.country,
            year=req.year,
            crop=req.crop,
            risk_score=req.risk_score,
            p50=req.p50,
            p10=req.p10,
            p90=req.p90,
            spread=req.spread,
            risk_category=req.risk_category,
            lang=req.lang,
        )
        return TipsResponse(tips=tips)
    except Exception as e:
        logger.exception("Tips error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/recommend", response_model=RecommendResponse)
def api_recommend(req: RegionDataRequest) -> RecommendResponse:
    """
    Агро-рекомендация по данным региона (кредитный советник).
    Возвращает секции: riskAssessment, immediateActions, seasonalOutlook, resourceOptimization.
    """
    try:
        data = req.model_dump()
        sections, is_mock = get_recommendation(data)
        return RecommendResponse(
            riskAssessment=sections.get("riskAssessment", ""),
            immediateActions=sections.get("immediateActions", ""),
            seasonalOutlook=sections.get("seasonalOutlook", ""),
            resourceOptimization=sections.get("resourceOptimization", ""),
            raw=sections.get("raw", ""),
            is_mock=is_mock,
        )
    except Exception as e:
        logger.exception("Recommend error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/explain-kpi", response_model=ExplainKpiResponse)
def api_explain_kpi(req: ExplainKpiRequest) -> ExplainKpiResponse:
    """
    Объяснение KPI карточки (portfolio / yield / confidence) — legacy, plain text.
    """
    try:
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
        explanation, is_mock = explain_kpi(req.cardId, metrics)
        return ExplainKpiResponse(explanation=explanation, isMock=is_mock)
    except Exception as e:
        logger.exception("Explain KPI error: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


def _fallback_kpi_explain_response(kpi_key: str, scope: dict, reason: str) -> dict:
    """Минимальный валидный JSON при любой ошибке — фронт всегда получает 200."""
    return {
        "title": f"KPI: {kpi_key}",
        "subtitle": f"{scope.get('crop', '')} · {scope.get('year', '')}",
        "badges": [],
        "hero": {"headline": "Explanation temporarily unavailable.", "summary": reason},
        "metrics": [],
        "sections": [],
        "table": None,
        "confidence": {"level": "low", "reason": "Service fallback", "limitations": [reason]},
        "next_actions": [],
        "disclaimer": "Try again or check AI service logs.",
    }


@app.post("/explain-kpi-structured")
def api_explain_kpi_structured(req: ExplainKpiStructuredRequest) -> dict:
    """
    Структурированное объяснение KPI: строго JSON для UI.
    При любой ошибке возвращаем 200 с fallback-структурой, чтобы фронт не получал 503.
    """
    try:
        scope = req.scope.model_dump()
        meta = req.meta.model_dump() if req.meta else {}
        result = explain_kpi_structured(
            kpi_group=req.kpi_group,
            kpi_key=req.kpi_key,
            scope=scope,
            kpi_values=req.kpi_values,
            meta=meta,
            request_id=req.request_id,
        )
        return result
    except Exception as e:
        logger.exception("Explain KPI structured error: %s", e)
        return _fallback_kpi_explain_response(
            req.kpi_key,
            req.scope.model_dump(),
            str(e)[:200],
        )
