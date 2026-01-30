"""
Quick test script for inference module.
Run: python test_inference.py
"""
from pathlib import Path
import pandas as pd
from inference import RiskScorer

DEPLOY_DIR = Path(__file__).parent
DATASET_PATH = DEPLOY_DIR / "dataset.csv"


def main():
    print("Loading RiskScorer...")
    scorer = RiskScorer(DEPLOY_DIR)
    print(f"  Models loaded: p10, p50, p90")
    print(f"  Features: {len(scorer.feature_cols_final)} columns")
    print(f"  sigma_down={scorer.sigma_down:.4f}, sigma_up={scorer.sigma_up:.4f}")

    # Test 1: Single prediction
    print("\n--- Test 1: Single prediction ---")
    result = scorer.predict_single(
        region_id="TEST_REGION",
        year=2024,
        crop="wheat",
        features={
            "precipitation_total_mm": 280,
            "temperature_mean_C": 16.5,
            "precipitation_anomaly_mm": -30,
            "NDVI": 0.38,
            "VH": -20,
            "VV": -14,
            "elevation": 450,
            "slope": 1.2,
        }
    )
    for k, v in result.items():
        print(f"  {k}: {v}")

    # Test 2: Batch prediction from dataset
    if DATASET_PATH.exists():
        print("\n--- Test 2: Batch prediction (first 10 rows from dataset) ---")
        df = pd.read_csv(DATASET_PATH).head(10)
        batch_result = scorer.predict(df)
        print(f"  Predicted {len(batch_result['p50'])} rows")
        print(f"  p10 range: [{batch_result['p10'].min():.2f}, {batch_result['p10'].max():.2f}]")
        print(f"  p50 range: [{batch_result['p50'].min():.2f}, {batch_result['p50'].max():.2f}]")
        print(f"  p90 range: [{batch_result['p90'].min():.2f}, {batch_result['p90'].max():.2f}]")
        print(f"  Risk categories: {set(batch_result['risk_category'])}")
    else:
        print(f"\n[SKIP] Dataset not found at {DATASET_PATH}")

    print("\n[OK] Inference module works correctly!")


if __name__ == "__main__":
    main()
