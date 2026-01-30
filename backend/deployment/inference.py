"""
Crop Yield Risk Scoring Engine — Inference Module (Backend Integration).

Usage:
    from inference import RiskScorer
    scorer = RiskScorer("path/to/deployment")
    result = scorer.predict(df)  # df with required columns

Returns dict with: p10, p50, p90, risk_category for each row.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import joblib


class RiskScorer:
    """
    Production inference class for Crop Yield Risk Scoring.
    Loads trained models and calibration config, applies feature engineering,
    and returns calibrated quantile predictions (p10, p50, p90) + risk category.
    """

    def __init__(self, deployment_dir: str | Path):
        """
        Load models and config from deployment directory.
        
        Args:
            deployment_dir: Path to deployment folder with model_p10.joblib, model_p50.joblib,
                            model_p90.joblib, config.json.
        """
        self.deploy_dir = Path(deployment_dir)
        self.model_p10 = joblib.load(self.deploy_dir / "model_p10.joblib")
        self.model_p50 = joblib.load(self.deploy_dir / "model_p50.joblib")
        self.model_p90 = joblib.load(self.deploy_dir / "model_p90.joblib")
        with open(self.deploy_dir / "config.json", "r", encoding="utf-8") as f:
            self.config = json.load(f)
        self.feature_cols = self.config["feature_cols"]
        self.feature_cols_final = self.config["feature_cols_final"]
        self.train_medians = self.config["train_medians"]
        self.missing_cols = self.config["missing_cols"]
        self.sigma_down = self.config["sigma_down"]
        self.sigma_up = self.config["sigma_up"]
        self.K_UP = self.config["K_UP"]
        self.DROUGHT_STRESS_EXTRA = self.config["DROUGHT_STRESS_EXTRA"]
        self.COMPOUND_STRESS_EXTRA = self.config["COMPOUND_STRESS_EXTRA"]

    @staticmethod
    def get_k_down(crop: str) -> float:
        """Conditional downside stress by crop."""
        if crop in ["cotton"]:
            return 2.6
        if crop in ["wheat", "rice"]:
            return 2.2
        return 2.0

    def feature_engineering(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Apply same feature engineering as training (lags, extremes, interactions).
        Note: lags require historical data; for single-row inference, fill with median.
        """
        df = df.copy()
        df = df.sort_values(["region_id", "crop", "year"]).reset_index(drop=True) if "region_id" in df.columns and "crop" in df.columns and "year" in df.columns else df

        # Lagged features
        if "NDVI" in df.columns:
            if "region_id" in df.columns and "crop" in df.columns:
                df["NDVI_lag_1"] = df.groupby(["region_id", "crop"])["NDVI"].shift(1)
            else:
                df["NDVI_lag_1"] = np.nan
        if "precipitation_total_mm" in df.columns:
            if "region_id" in df.columns and "crop" in df.columns:
                df["precipitation_total_mm_lag_1"] = df.groupby(["region_id", "crop"])["precipitation_total_mm"].shift(1)
            else:
                df["precipitation_total_mm_lag_1"] = np.nan

        # Climatic extremes
        if "precipitation_anomaly_mm" in df.columns:
            df["is_drought"] = (df["precipitation_anomaly_mm"] < -50).astype(int)
        else:
            df["is_drought"] = 0
        if "temperature_mean_C" in df.columns:
            df["heat_stress"] = (df["temperature_mean_C"] > 25).astype(int)
        else:
            df["heat_stress"] = 0

        # Interaction terms
        if "precipitation_total_mm" in df.columns and "temperature_mean_C" in df.columns:
            df["precip_x_temp"] = df["precipitation_total_mm"] * df["temperature_mean_C"]
        if "VH" in df.columns and "VV" in df.columns:
            df["radar_structure"] = df["VH"] / df["VV"].replace(0, np.nan)

        return df

    def apply_missing_and_fill(self, X: pd.DataFrame) -> pd.DataFrame:
        """Apply train medians and missing indicators."""
        X = X.copy()
        for c in self.missing_cols:
            med = self.train_medians.get(c, 0)
            X[c + "_missing"] = X[c].isna().astype(int) if c in X.columns else 0
            if c in X.columns:
                X[c] = X[c].fillna(med)
        return X

    def calibrate(
        self,
        pred_p50: np.ndarray,
        crop: np.ndarray | pd.Series | None = None,
        is_drought: np.ndarray | None = None,
        heat_stress: np.ndarray | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Apply asymmetric calibration with per-row K_DOWN(crop), drought and compound-stress overrides."""
        pred_p50_arr = np.asarray(pred_p50, dtype=float)
        n = len(pred_p50_arr)
        if crop is not None and len(crop) == n:
            k_down = np.array([self.get_k_down(str(c)) for c in crop])
        else:
            k_down = np.full(n, 2.0)
        pred_p10_cal = pred_p50_arr - k_down * self.sigma_down
        pred_p90_cal = pred_p50_arr + self.K_UP * self.sigma_up

        if is_drought is not None and len(is_drought) == n:
            mask = np.asarray(is_drought, dtype=bool)
            pred_p10_cal[mask] -= self.DROUGHT_STRESS_EXTRA * self.sigma_down

        if is_drought is not None and heat_stress is not None and len(is_drought) == n and len(heat_stress) == n:
            stress_mask = np.asarray(is_drought, dtype=bool) & np.asarray(heat_stress, dtype=bool)
            pred_p10_cal[stress_mask] -= self.COMPOUND_STRESS_EXTRA * self.sigma_down

        return pred_p10_cal, pred_p90_cal

    @staticmethod
    def risk_category(p10: float, p50: float, p90: float, actual: float | None = None) -> str:
        """
        Assign risk category based on predicted uncertainty and/or actual value.
        If actual is None, use p50 deviation from 0 and spread.
        """
        spread = p90 - p10
        if actual is not None:
            if actual < p10:
                return "High"
            elif actual < p50:
                return "Moderate_High"
            elif actual < p90:
                return "Moderate_Low"
            else:
                return "Low"
        else:
            if p50 < -10:
                return "High"
            elif p50 < -5:
                return "Moderate_High"
            elif p50 < 5:
                return "Moderate_Low"
            else:
                return "Low"

    def predict(self, df: pd.DataFrame) -> dict[str, Any]:
        """
        Run full inference pipeline on input dataframe.
        
        Args:
            df: DataFrame with columns matching training data (at minimum: feature_cols).
                Should include 'crop', 'region_id', 'year' for lags and calibration.
        
        Returns:
            dict with:
                - p10: np.ndarray of calibrated 10th percentile predictions
                - p50: np.ndarray of median predictions
                - p90: np.ndarray of calibrated 90th percentile predictions
                - risk_category: list of risk labels per row
                - spread: np.ndarray of p90 - p10
        """
        df = self.feature_engineering(df)
        X = df[self.feature_cols].copy() if all(c in df.columns for c in self.feature_cols) else df[[c for c in self.feature_cols if c in df.columns]].copy()
        X = self.apply_missing_and_fill(X)
        # Ensure all final feature columns present
        for c in self.feature_cols_final:
            if c not in X.columns:
                X[c] = 0
        X = X[self.feature_cols_final]

        pred_p50 = self.model_p50.predict(X)
        crop = df["crop"].values if "crop" in df.columns else None
        is_drought = df["is_drought"].values if "is_drought" in df.columns else None
        heat_stress = df["heat_stress"].values if "heat_stress" in df.columns else None
        pred_p10_cal, pred_p90_cal = self.calibrate(pred_p50, crop=crop, is_drought=is_drought, heat_stress=heat_stress)

        risk_cats = [self.risk_category(p10, p50, p90) for p10, p50, p90 in zip(pred_p10_cal, pred_p50, pred_p90_cal)]

        return {
            "p10": pred_p10_cal,
            "p50": pred_p50,
            "p90": pred_p90_cal,
            "risk_category": risk_cats,
            "spread": pred_p90_cal - pred_p10_cal,
        }

    def predict_single(
        self,
        region_id: str,
        year: int,
        crop: str,
        features: dict[str, float],
    ) -> dict[str, Any]:
        """
        Convenience method for single-row inference (REST API style).
        
        Args:
            region_id: Region identifier.
            year: Year.
            crop: Crop type (wheat, cotton, rice).
            features: dict of feature values (precipitation_total_mm, temperature_mean_C, NDVI, etc.).
        
        Returns:
            dict with p10, p50, p90, risk_category, spread for this single observation.
        """
        row = {"region_id": region_id, "year": year, "crop": crop}
        row.update(features)
        df = pd.DataFrame([row])
        result = self.predict(df)
        return {
            "region_id": region_id,
            "year": year,
            "crop": crop,
            "p10": float(result["p10"][0]),
            "p50": float(result["p50"][0]),
            "p90": float(result["p90"][0]),
            "risk_category": result["risk_category"][0],
            "spread": float(result["spread"][0]),
        }


# Example usage / quick test
if __name__ == "__main__":
    import sys
    deploy_path = Path(__file__).parent
    if not (deploy_path / "model_p50.joblib").exists():
        print("Models not found. Run train_risk_model.py first.")
        sys.exit(1)
    scorer = RiskScorer(deploy_path)
    # Test with dummy data
    test_row = {
        "region_id": "TEST_REGION",
        "year": 2024,
        "crop": "wheat",
        "precipitation_total_mm": 300,
        "temperature_mean_C": 18,
        "precipitation_anomaly_mm": -20,
        "NDVI": 0.35,
        "VH": -15,
        "VV": -10,
        "elevation": 500,
        "slope": 2,
    }
    result = scorer.predict_single(**{k: v for k, v in test_row.items() if k in ["region_id", "year", "crop"]}, features={k: v for k, v in test_row.items() if k not in ["region_id", "year", "crop"]})
    print("Single prediction result:")
    for k, v in result.items():
        print(f"  {k}: {v}")
