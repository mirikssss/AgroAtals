# AgroAtlas Backend — микросервисная архитектура

Бэкенд разделён на три микросервиса: **Dashboard** (API Gateway), **AI Service**, **Risk Service**.

## Схема

```
                    ┌─────────────────────────────────────┐
                    │         Dashboard (port 8000)         │
                    │  • GET  /dashboard/chart-data        │
                    │  • GET  /dashboard/metrics           │
                    │  • POST /dashboard/predict            │
                    │  • POST /dashboard/recommend         │
                    │  • POST /dashboard/explain-kpi       │
                    └──────────────┬────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ Risk Service     │  │ AI Service       │  │ (данные: CSV,    │
    │ (port 8002)      │  │ (port 8001)      │  │  config, districts)│
    │ POST /predict    │  │ POST /tips       │  │                 │
    │                  │  │ POST /recommend  │  │                 │
    │ inference.py,    │  │ POST /explain-kpi│  │                 │
    │ модели ML        │  │ Gemini API       │  │                 │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Сервисы

| Сервис    | Папка              | Порт | Назначение |
|-----------|--------------------|------|------------|
| Dashboard | `services/dashboard` | 8000 | API Gateway: chart-data, агрегация metrics (Risk + AI), прокси recommend/explain-kpi |
| AI        | `services/ai_service` | 8001 | Gemini: советы по рискам, агро-рекомендации, объяснения KPI |
| Risk      | `services/risk_service` | 8002 | ML-модели (LightGBM): p10/p50/p90, risk_category |

## Запуск

### 1. Переменные окружения

- **Dashboard**: `AI_SERVICE_URL`, `RISK_SERVICE_URL` (по умолчанию `http://localhost:8001`, `http://localhost:8002`), `DATASET_PATH`, `DEPLOYMENT_DIR`, `DISTRICTS_DIR` (опционально).
- **AI Service**: `GEMINI_API_KEY` или `NEXT_PUBLIC_GEMINI_API_KEY` (в `.env` или `.env.local` в корне проекта).
- **Risk Service**: `DEPLOYMENT_DIR` (по умолчанию `backend/deployment` — папка с `inference.py`, моделями, `config.json`).

Убедитесь, что в `backend/deployment` есть `config.json`, `model_p10.joblib`, `model_p50.joblib`, `model_p90.joblib` и при необходимости `dataset.csv` (путь задаётся через `DATASET_PATH` для dashboard).

### 2. Запуск по отдельности

Из корня проекта:

```bash
# Терминал 1 — AI Service
cd backend/services/ai_service && pip install -r requirements.txt && uvicorn app:app --port 8001

# Терминал 2 — Risk Service
cd backend/services/risk_service && pip install -r requirements.txt && uvicorn app:app --port 8002

# Терминал 3 — Dashboard
cd backend/services/dashboard && pip install -r requirements.txt && uvicorn app:app --port 8000
```

Фронтенд по умолчанию обращается к Dashboard по `NEXT_PUBLIC_DASHBOARD_API_URL` (например `http://localhost:8000`).

### 3. Запуск через скрипт (Windows)

Из корня репозитория:

```powershell
.\backend\scripts\run-all-services.ps1
```

Скрипт поднимает все три сервиса в фоне (или используйте три терминала вручную).

## Безопасность и эффективность

- **DTO**: все запросы/ответы валидируются через Pydantic (ограничение длины, диапазоны, типы).
- **AI Service**: таймауты и fallback при недоступности Gemini; советы и рекомендации изолированы в одном сервисе.
- **Risk Service**: только предсказание по моделям; тяжёлые зависимости (pandas, lightgbm) не в Dashboard.
- **Dashboard**: не хранит ключей Gemini и не загружает ML-модели; при падении AI возвращает fallback-советы, при падении Risk — 503.

## Структура

```
backend/
├── deployment/          # Модели, inference.py, config.json (общие для Risk)
├── services/
│   ├── dashboard/       # API Gateway + chart-data
│   │   ├── app.py
│   │   ├── dto.py
│   │   └── requirements.txt
│   ├── ai_service/
│   │   ├── app.py
│   │   ├── dto.py
│   │   ├── gemini_service.py
│   │   └── requirements.txt
│   └── risk_service/
│       ├── app.py
│       ├── dto.py
│       └── requirements.txt
├── scripts/
│   └── run-all-services.ps1
└── README.md
```
