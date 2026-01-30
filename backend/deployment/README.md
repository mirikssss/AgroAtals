# Crop Yield Risk Scoring Engine — Deployment Package

Готовый пакет для интеграции ML-модели в бэкенд. Содержит обученные модели LightGBM (quantile regression), конфигурацию калибровки и inference-модуль.

## Содержимое

```
deployment/
├── model_p10.joblib      # LightGBM quantile model (alpha=0.1, downside)
├── model_p50.joblib      # LightGBM quantile model (alpha=0.5, median)
├── model_p90.joblib      # LightGBM quantile model (alpha=0.9, upside)
├── config.json           # Калибровка: sigma_down, sigma_up, train_medians, feature_cols
├── inference.py          # Python-модуль для инференса (RiskScorer класс)
├── requirements.txt      # Зависимости для бэкенда
└── README.md             # Эта документация
```

## Установка зависимостей

```bash
pip install -r requirements.txt
```

## Использование

### Импорт и инициализация

```python
from inference import RiskScorer

# Путь к папке deployment (где лежат модели и config.json)
scorer = RiskScorer("path/to/deployment")
```

### Batch-предсказание (DataFrame)

```python
import pandas as pd

df = pd.DataFrame([
    {
        "region_id": "KAZ_ALMATY",
        "year": 2024,
        "crop": "wheat",
        "precipitation_total_mm": 320,
        "temperature_mean_C": 17.5,
        "precipitation_anomaly_mm": -15,
        "NDVI": 0.42,
        "VH": -18,
        "VV": -12,
        "elevation": 600,
        "slope": 1.5,
    },
    # ... ещё строки
])

result = scorer.predict(df)

# result = {
#     "p10": np.ndarray,         # консервативный прогноз (downside)
#     "p50": np.ndarray,         # медианный прогноз
#     "p90": np.ndarray,         # оптимистичный прогноз
#     "risk_category": list,     # "High", "Moderate_High", "Moderate_Low", "Low"
#     "spread": np.ndarray,      # p90 - p10 (волатильность)
# }
```

### Single-row предсказание (REST API style)

```python
result = scorer.predict_single(
    region_id="KAZ_ALMATY",
    year=2024,
    crop="wheat",
    features={
        "precipitation_total_mm": 320,
        "temperature_mean_C": 17.5,
        "precipitation_anomaly_mm": -15,
        "NDVI": 0.42,
        "VH": -18,
        "VV": -12,
        "elevation": 600,
        "slope": 1.5,
    }
)

# result = {
#     "region_id": "KAZ_ALMATY",
#     "year": 2024,
#     "crop": "wheat",
#     "p10": -5.23,
#     "p50": -1.45,
#     "p90": 2.12,
#     "risk_category": "Moderate_Low",
#     "spread": 7.35,
# }
```

## Входные данные (features)

Минимально необходимые колонки:

| Колонка | Описание | Единицы |
|---------|----------|---------|
| `region_id` | Идентификатор региона (Admin-2) | string |
| `year` | Год | int |
| `crop` | Культура: wheat, cotton, rice | string |
| `precipitation_total_mm` | Годовые осадки | мм |
| `temperature_mean_C` | Средняя температура | °C |
| `precipitation_anomaly_mm` | Аномалия осадков | мм |
| `NDVI` | Вегетационный индекс | 0–1 |
| `VH`, `VV` | Radar backscatter (Sentinel-1) | dB |
| `elevation`, `slope` | Рельеф | м, ° |

Дополнительные колонки (улучшают точность): `EVI`, `LAI_proxy`, `s1_count`, `s2_count`, `vol_soil_water_l1`, `GTC`, и др.

## Выходные данные

| Поле | Описание |
|------|----------|
| `p10` | Консервативный прогноз yield anomaly (%) — 10-й перцентиль |
| `p50` | Медианный прогноз yield anomaly (%) |
| `p90` | Оптимистичный прогноз yield anomaly (%) — 90-й перцентиль |
| `risk_category` | Категория риска: High / Moderate_High / Moderate_Low / Low |
| `spread` | Ширина интервала (p90 − p10) — мера неопределённости |

## Калибровка

Модель использует **асимметричную downside-aware калибровку** (банковский / страховой стандарт):

- **K_DOWN** по культуре: cotton=2.6, wheat/rice=2.2, default=2.0
- **K_UP** = 1.0 (биологически ограничен)
- Дополнительные стресс-поправки: drought (+0.5×σ_down), compound stress (drought+heat: +0.75×σ_down)

## Метрики модели

```
MAE (p50):  1.35
RMSE:       1.60
Coverage [p10–p90]: 80%
Downside Miss Rate: 17%
Volatility Spread:  2.62
```

## Интеграция в FastAPI (пример)

```python
from fastapi import FastAPI
from pydantic import BaseModel
from inference import RiskScorer

app = FastAPI()
scorer = RiskScorer("./deployment")

class PredictionRequest(BaseModel):
    region_id: str
    year: int
    crop: str
    precipitation_total_mm: float
    temperature_mean_C: float
    precipitation_anomaly_mm: float
    NDVI: float
    VH: float
    VV: float
    elevation: float
    slope: float

@app.post("/predict")
def predict(req: PredictionRequest):
    features = req.dict()
    region_id = features.pop("region_id")
    year = features.pop("year")
    crop = features.pop("crop")
    return scorer.predict_single(region_id, year, crop, features)
```

## Датасет

Для обучения / переобучения используется:
- `data/processed/central_asia_yield_dataset.csv`

Для миграции в бэкенд датасет **не требуется** — только модели и config.json.
