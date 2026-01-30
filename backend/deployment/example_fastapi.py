"""
Example FastAPI integration for Crop Yield Risk Scoring Engine.

Run:
    pip install fastapi uvicorn
    uvicorn example_fastapi:app --reload

Test:
    curl -X POST http://localhost:8000/predict \
        -H "Content-Type: application/json" \
        -d '{"region_id":"KAZ_01","year":2024,"crop":"wheat","precipitation_total_mm":300,"temperature_mean_C":17,"precipitation_anomaly_mm":-20,"NDVI":0.4,"VH":-18,"VV":-12,"elevation":500,"slope":2}'
"""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from inference import RiskScorer

app = FastAPI(
    title="Crop Yield Risk Scoring API",
    description="Bank-grade agricultural credit risk assessment",
    version="1.0.0",
)

# Initialize scorer on startup
DEPLOY_DIR = Path(__file__).parent
scorer: Optional[RiskScorer] = None


@app.on_event("startup")
def load_models():
    global scorer
    scorer = RiskScorer(DEPLOY_DIR)
    print(f"Models loaded. Features: {len(scorer.feature_cols_final)}")


class PredictionRequest(BaseModel):
    region_id: str
    year: int
    crop: str  # wheat, cotton, rice
    precipitation_total_mm: float
    temperature_mean_C: float
    precipitation_anomaly_mm: float = 0.0
    NDVI: float = 0.3
    VH: float = -20.0
    VV: float = -14.0
    elevation: float = 500.0
    slope: float = 1.0
    # Optional additional features
    EVI: Optional[float] = None
    LAI_proxy: Optional[float] = None
    s1_count: Optional[float] = None
    s2_count: Optional[float] = None


class PredictionResponse(BaseModel):
    region_id: str
    year: int
    crop: str
    p10: float  # Conservative / worst case
    p50: float  # Expected / median
    p90: float  # Optimistic / best case
    risk_category: str  # High, Moderate_High, Moderate_Low, Low
    spread: float  # p90 - p10 (uncertainty)


@app.post("/predict", response_model=PredictionResponse)
def predict(req: PredictionRequest):
    if scorer is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    features = {k: v for k, v in req.dict().items() if k not in ["region_id", "year", "crop"] and v is not None}
    
    try:
        result = scorer.predict_single(
            region_id=req.region_id,
            year=req.year,
            crop=req.crop,
            features=features,
        )
        return PredictionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": scorer is not None}


@app.get("/info")
def info():
    if scorer is None:
        return {"status": "not_ready"}
    return {
        "status": "ready",
        "feature_count": len(scorer.feature_cols_final),
        "sigma_down": scorer.sigma_down,
        "sigma_up": scorer.sigma_up,
        "metrics": scorer.config.get("metrics", {}),
    }
