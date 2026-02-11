"""
Risk Microservice — предсказание риска урожая (LightGBM квантильная регрессия).
Использует inference из backend/deployment. Эндпоинт: POST /predict.
"""
from __future__ import annotations

import os
from typing import Any
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Путь к deployment (inference.py, модели, config.json)
# risk_service -> services -> backend; deployment рядом с services
SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVICE_DIR.parent.parent
DEPLOYMENT_DIR = Path(os.environ.get("DEPLOYMENT_DIR", str(BACKEND_DIR / "deployment")))
if not DEPLOYMENT_DIR.exists():
    raise RuntimeError(f"Deployment directory not found: {DEPLOYMENT_DIR}")
sys.path.insert(0, str(DEPLOYMENT_DIR))

from inference import RiskScorer  # noqa: E402

from dto import PredictRequest, PredictResponse

app = FastAPI(
    title="AgroAtlas Risk Service",
    version="1.0.0",
    description="Микросервис оценки риска урожая: p10/p50/p90, risk_category.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scorer: RiskScorer | None = None


@app.on_event("startup")
def startup() -> None:
    global scorer
    scorer = RiskScorer(DEPLOYMENT_DIR)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "AgroAtlas Risk Service",
        "docs": "/docs",
        "health": "/health",
        "endpoints": ["POST /predict"],
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "models_loaded": scorer is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    """
    Предсказание риска для одного наблюдения (region_id, year, crop, features).
    """
    if scorer is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    try:
        result = scorer.predict_single(
            region_id=req.region_id,
            year=req.year,
            crop=req.crop,
            features=req.features,
        )
        return PredictResponse(
            region_id=result["region_id"],
            year=result["year"],
            crop=result["crop"],
            p10=float(result["p10"]),
            p50=float(result["p50"]),
            p90=float(result["p90"]),
            spread=float(result["spread"]),
            risk_category=str(result["risk_category"]),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
