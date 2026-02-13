# Деплой в продакшен

## Ошибка «Connection refused» и 503 Service Unavailable

Если в логах видите:

- `KPI Risk service error: [Errno 111] Connection refused`
- `Risk service unavailable: [Errno 111] Connection refused`
- `kpi-explain ... Connection refused`
- Ответы **503 Service Unavailable** на `/dashboard/metrics`, `/dashboard/kpi-cards`, `/dashboard/kpi-explain`

**Причина:** Dashboard не может достучаться до **Risk Service** (порт 8002) и/или **AI Service** (порт 8001). По умолчанию используются `http://localhost:8002` и `http://localhost:8001`. В проде либо эти сервисы не запущены, либо переменные окружения не заданы.

---

## Чеклист для продакшена

### 1. Запустить все три сервиса

Должны быть запущены **одновременно**:

| Сервис    | Порт | Команда (из корня проекта) |
|-----------|------|----------------------------|
| **Risk Service** | 8002 | `cd backend/services/risk_service && pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 8002` |
| **AI Service**   | 8001 | `cd backend/services/ai_service && pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 8001` |
| **Dashboard**    | 8000 | `cd backend/services/dashboard && pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 8000` |

Без Risk Service метрики и KPI-карточки всегда будут отдавать 503. Без AI Service объяснения KPI (`/dashboard/kpi-explain`) будут 503.

### 2. Задать переменные окружения для Dashboard

Перед запуском **Dashboard** в проде задайте URL сервисов так, как к ним реально подключаться с той машины, где крутится Dashboard:

- **Одна машина (все на одном сервере):**
  - `RISK_SERVICE_URL=http://127.0.0.1:8002`
  - `AI_SERVICE_URL=http://127.0.0.1:8001`

- **Разные машины или Docker:**
  - `RISK_SERVICE_URL=http://<хост-risk>:8002`
  - `AI_SERVICE_URL=http://<хост-ai>:8001`

Пример для Linux/Mac в той же оболочке, где запускаете Dashboard:

```bash
export RISK_SERVICE_URL=http://127.0.0.1:8002
export AI_SERVICE_URL=http://127.0.0.1:8001
cd backend/services/dashboard && uvicorn app:app --host 0.0.0.0 --port 8000
```

Или создайте файл `backend/services/dashboard/.env`:

```
RISK_SERVICE_URL=http://127.0.0.1:8002
AI_SERVICE_URL=http://127.0.0.1:8001
```

### 3. Проверка после запуска

1. **При старте Dashboard** в консоли должны появиться строки:
   - `RISK_SERVICE_URL=...`
   - `AI_SERVICE_URL=...`
   Если там по-прежнему `localhost`, переменные окружения не подхватились.

2. **Эндпоинт диагностики** — откройте в браузере или вызовите:
   ```text
   GET https://ваш-домен/dashboard/health/dependencies
   ```
   В ответе будет видно, доступны ли Risk и AI сервисы (`reachable: true/false` и при необходимости `error`).

3. Проверьте, что Risk и AI отвечают:
   - `GET http://<хост>:8002/health` — Risk
   - `GET http://<хост>:8001/health` — AI

### 4. Фронтенд

Убедитесь, что фронт ходит на правильный URL Dashboard: переменная `NEXT_PUBLIC_DASHBOARD_API_URL` при сборке (или в конфиге окружения) должна указывать на ваш продовый Dashboard, например `https://api.ваш-домен.com` или `http://сервер:8000`.

---

## Кратко

- **503 и Connection refused** = Dashboard не видит Risk и/или AI сервисы.
- **Что сделать:** запустить Risk (8002) и AI (8001), задать для Dashboard `RISK_SERVICE_URL` и `AI_SERVICE_URL`, перезапустить Dashboard и проверить `/dashboard/health/dependencies`.
