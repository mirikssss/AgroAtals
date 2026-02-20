# AgroRisk (AgroAtlas Analytics Map)

Веб-приложение для оценки сельскохозяйственного и кредитного риска: спутниковые данные, ML-прогнозы урожая, карта регионов, кредитный анализ по нарисованному участку и AI-рекомендации.

---

## Содержание

- [Обзор](#обзор)
- [Страницы и функционал](#страницы-и-функционал)
- [Бэкенд-сервисы](#бэкенд-сервисы)
- [Запуск](#запуск)
- [Масштабирование UI](#масштабирование-ui)

---

## Обзор

- **Фронтенд:** Next.js (App Router), React, Tailwind, Recharts, Leaflet. Один маршрут `/`; по авторизации показывается лендинг или дашборд.
- **Бэкенд:** три микросервиса — **Dashboard** (API Gateway), **Risk Service** (ML-модели), **AI Service** (Gemini). Dashboard агрегирует данные, считает DSCR и спутниковые индексы, проксирует запросы к Risk и AI.

---

## Страницы и функционал

### 1. Лендинг (Landing Page)

**Когда показывается:** пользователь не авторизован.

**Функционал:**

- **Hero:** фоновая картинка, заголовок «AgroRisk», подзаголовок про field-level insights для кредита и страхования. Кнопки **Get Started** и **Sign In** открывают модалку авторизации (режим регистрации / входа).
- **Навбар:** логотип AgroRisk, кнопки Sign In и Sign Up (то же модальное окно).
- **Блок Features:** четыре карточки — Satellite Monitoring, AI Risk Models, Field-Level Analytics, Confidence Intervals (P10/P50/P90).
- **Блок Use Cases:** «Trusted By» — банки, страховые, агро-аналитики.
- **How It Works:** четыре шага — Select Field → Choose Crop → Run Analysis → Get Insights.
- **Footer:** ссылки Product, Company, Legal, Resources.

**Как работает:** клик по Get Started / Sign Up устанавливает режим модалки «signup», по Sign In — «signin»; модалка открывается через контекст `AuthContext`. После успешного входа состояние `isAuthenticated` меняется, рендерится дашборд.

---

### 2. Дашборд (Dashboard) — вкладка «Дашборд»

**Когда показывается:** авторизованный пользователь, активная вкладка **Dashboard** в боковом меню.

**Функционал:**

- **Интерактивная карта риска (InteractiveRiskMap):** на весь экран. Отображает полигоны областей (UZB) или районов при выборе области. Цвет полигона по аномалии урожая (p50): красный (< −15%), оранжевый (−15%…−5%), серый (−5%…+5%), светло-зелёный (+5%…+15%), тёмно-зелёный (> +15%). Данные для раскраски — `GET /dashboard/metrics` по каждому полигону (scope=region или district, area_name).
- **Фильтры над картой:** страна (по умолчанию UZB), область (список из GeoJSON), год (текущий / список). При смене области подгружается GeoJSON районов из `/districts/<region>.json`, карта переключается на уровень районов.
- **KPI-карточки:** запрос `GET /dashboard/kpi-cards` с параметрами country, region_level, region_id, crop, year. Отображаются: **Yield Anomaly (p50)**, **Downside Risk (p10)**, **High Risk Share**, **DSCR (p50/p10, статус healthy/borderline/stress)**, **Vegetation Health** (NDVI-индекс), **Season Stress** (drought/heat/ndvi_drop). При клике по области/району на карте выбор обновляется и KPI перезапрашиваются.
- **Explain по карточке:** при клике по KPI-карточке открывается модалка «Explain». Отправляется запрос к Dashboard `POST /dashboard/explain-kpi` (или structured), Dashboard вызывает AI Service; в модалке показывается структурированный ответ (заголовки, метрики, секции, рекомендации) или текст. Контекст для Explain — выбранный регион, метрики (valueAtRisk, riskScore, yieldAnomaly, p10/p50/p90, spread, confidenceLabel).
- **Боковая панель:** общая для всего приложения — иконки Дашборд, Портфель, Аналитика, Участки; профиль и выход; сворачивание/разворот панели.

**Как работает:** карта рендерится через динамический импорт Leaflet; при выборе страны загружается `/regions.json`, при выборе области — соответствующий файл из `/districts/`. KPI и метрики для раскраски идут с Dashboard; при недоступности Risk Service — 503, при недоступности AI — fallback-советы.

---

### 3. Портфель (Portfolio)

**Когда показывается:** вкладка **Portfolio** в боковом меню.

**Функционал:**

- **Заголовок:** «Asset Portfolio», краткое описание.
- **Import CSV:** кнопка открывает блок загрузки CSV. Ожидаемые колонки: Region, Crop, Exposure (USD), Maturity Date (опционально). После выбора файла режим загрузки закрывается (логика импорта — заглушка).
- **Фильтры:** выпадающие списки — по уровню риска (All / Low / Moderate / High) и по культуре (All / Wheat / Corn / Rice / Cotton). Фильтрация применяется к списку демо-активов.
- **Сетка активов:** карточки с полями: локация, культура, бейдж риска (Low/Moderate/High), Exposure, Yield Anomaly, District Level, Analysis Date, кнопка «View Details». Данные пока демо (sampleAssets); при пустом списке после фильтрации показывается заглушка «No assets match» и призыв создать первый актив.

**Как работает:** состояние filterRisk и filterCrop; список sampleAssets фильтруется; рендер карточек или пустого состояния. CSV upload только логирует имя файла и закрывает блок.

---

### 4. Аналитика — Кредитный риск анализ (Analytics)

**Когда показывается:** вкладка **Analytics** в боковом меню.

Модуль из трёх фаз: ввод параметров и участка → «AI Thinking» → результаты.

#### Фаза 1: Ввод (Input Phase)

- **Карта на весь экран:** компонент DrawMap с `fillHeight`: спутниковая/уличная карта (Leaflet + Esri), на весь доступный экран. Поверх — плавающие «стеклянные» карточки (glass): форма слева, тулбар карты справа сверху, при наличии — баннер «Detected Location», внизу — подсказки (Draw rectangle, Draw polygon, Edit shape, Region borders, District borders).
- **Форма слева (стеклянная карточка):** заголовок «Кредитный Риск Анализ», подзаголовок «Введите параметры кредита и нарисуйте участок на карте». Две секции одной высоты (grid):
  - **Параметры кредита:** Сумма кредита (USD), Процентная ставка (%), Срок (лет) — три инпута в ряд; выравнивание инпутов по низу ячеек.
  - **Нарисовать сельхозучасток:** при наличии нарисованного участка — координаты (широта/долгота) и иконка; Тип культуры (выбор: Хлопок, Пшеница, Рис, Кукуруза), Площадь (гектары). Площадь можно подставить автоматически из площади нарисованного полигона.
- **Рисование на карте:** инструменты — прямоугольник, полигон, редактирование, удаление, сброс вида. Включение границ областей (жёлтые) и районов (белые) из GeoJSON. После рисования фигуры в форму подставляются координаты центра и площадь; данные участвуют в запросе анализа.
- **Кнопка «Запуск анализа»:** активна при заполненных сумме кредита, площади и нарисованном участке. По нажатию вызывается `runAnalysis()`.

**Как работает:** форма хранит loanParams (loanAmount, interestRate, termYears, crop, hectares, drawnArea). DrawMap при создании/редактировании/удалении фигуры вызывает `onAreaDrawn(area)`, обновляется loanParams.drawnArea и при необходимости hectares. При «Запуск анализа» выполняется запрос к Dashboard.

#### Запуск анализа (runAnalysis)

1. Устанавливается фаза `analyzing`, сбрасывается ошибка.
2. Вызов **GET /dashboard/metrics** с country=UZB, year=текущий, crop из формы, scope=country, lang из настроек языка. Ответ: p10, p50, p90, spread, riskCategory, aiTips и др.
3. Показ пошаговой анимации «AI Thinking» (запрос Sentinel, обработка NDVI и т.д.).
4. Расчёт на фронте: базовая урожайность по культуре, прогноз урожая по p50 (аномалия), ожидаемая выручка, DSCR (годовой долг по кредиту из суммы/ставки/срока, NOI из выручки и cost_ratio). Формируется объект результата: predictedYield, yieldAnomaly, riskCategory, trendDynamics, ndviSlope, htcIndex, confidenceSpread, p10/p50/p90, dscr, annualDebtService, expectedRevenue, assetName, region, district, aiTips.
5. Переход в фазу **results**.

#### Фаза 2: Analyzing Phase

- Отображается последовательность шагов с иконками (например: запрос Sentinel, обработка NDVI, оценка риска и т.д.). Текущий шаг подсвечивается; шаги переключаются с задержкой до завершения запроса и расчётов.

#### Фаза 3: Результаты (Results Phase)

- **Шапка:** название актива, регион и район, бейдж риска (LOW / MODERATE / HIGH), кнопка «Новый анализ» (сброс в фазу input).
- **AI Recommendation:** кнопка раскрытия блока с агро-рекомендациями. При открытии вызывается AI Service (через Dashboard или напрямую) с контекстом по полю (регион, культура, NDVI, риск, DSCR и т.д.); отображается структурированный ответ (riskAssessment, immediateActions, seasonalOutlook, resourceOptimization) или заглушка при ошибке.
- **Карточка DSCR:** значение DSCR, годовой платёж по долгу, ожидаемая выручка; цвет по уровню (зелёный / оранжевый / красный).
- **Satellite Evidence (модуль на странице результатов):** для нарисованного полигона — слайдер года (2017–текущий), переключатель True Color / NDVI, режим сравнения До/После (baseline vs выбранный год), полоса из 8 миниатюр, подпись (год, окно композита, источник, облачность). Данные — **GET /dashboard/satellite/timelapse** (Copernicus Data Space Sentinel-2 L2A). Помогает банкиру/инвестору понять, почему оценка риска обоснована.
- **Метрики и графики:** предсказанный урожай (т/га), аномалия урожая (%), тренд, NDVI slope, HTC index, confidence spread; перцентили p10/p50/p90. Подгрузка **GET /dashboard/chart-data** (country, crop, scope) для графиков: NDVI anomaly timeline, risk distribution, precipitation vs vegetation.
- **AI Tips:** список советов из ответа /dashboard/metrics (aiTips).
- **Кнопка «Добавить в участки»:** сохраняет результат в локальное хранилище (fields-db, localStorage), вызывает `onFieldAdded()` — переход на вкладку «Участки».

**Как работает:** результат анализа хранится в state; при «Добавить в участки» вызывается `addField()` из `lib/fields-db.ts` с метаданными и снимком result, затем переключение на вкладку Fields.

---

### 5. Участки (Fields)

**Когда показывается:** вкладка **Fields** в боковом меню.

**Функционал:**

- **Список участков:** таблица из `getFields()` (localStorage, ключ `agro-fields`). Колонки: Location (district + coordinates), Crop, Risk Level (бейдж), Last Update, действия — «View Results», «Remove».
- **Детальный вид:** при выборе участка по «View Results» показывается `FieldDetailView`: те же метрики и структура, что в Results Phase (название, регион, район, риск, DSCR, урожай, перцентили, графики, AI tips). Кнопка «Back» возвращает к таблице.
- **Remove:** удаление записи из localStorage и обновление списка.

**Как работает:** данные хранятся только на клиенте (localStorage). При удалении вызывается `removeField(id)`, при открытии детали — `getFieldById(id)`; список обновляется через `refreshFields()`.

---

## Бэкенд-сервисы

Запуск и переменные окружения см. в [backend/README.md](backend/README.md). Ниже — назначение и основные эндпоинты каждого сервиса.

---

### Dashboard Service (API Gateway)

- **Порт:** 8000 (по умолчанию).
- **Назначение:** единая точка входа для фронта: агрегация данных, расчёт KPI, DSCR, спутниковых индексов (Vegetation Health, Season Stress), прокси к Risk и AI.

**Основные эндпоинты:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Информация о сервисе и ссылки на docs/health. |
| GET | `/health` | Статус сервиса. |
| GET | `/dashboard/health/dependencies` | Проверка доступности Risk и AI сервисов. |
| GET | `/dashboard/kpi-cards` | KPI для выбранного региона: yield_anomaly_p50, downside_risk_p10, portfolio_risk_share, dscr, vegetation_health, season_stress. Параметры: country, region_level, region_id, crop, year. Использует датасет, config (feature_cols), Risk Service (p10, p50, risk_category), локальный расчёт DSCR и спутниковых индексов. |
| GET | `/dashboard/metrics` | Метрики для одной единицы: p10/p50/p90, spread, risk_category, riskScore, valueAtRisk, confidenceLabel, aiTips. Параметры: country, year, crop, scope, area_name, lang. Risk Service — прогноз; AI Service — советы (с fallback при недоступности). |
| GET | `/dashboard/chart-data` | Данные для графиков: ndviAnomalyTimeline, riskDistribution, precipVsVegetation. Параметры: country, crop, scope. |
| POST | `/dashboard/predict` | Прокси к Risk Service `POST /predict`. |
| POST | `/dashboard/recommend` | Прокси к AI Service `POST /recommend`. |
| POST | `/dashboard/kpi-explain` | Прокси к AI для объяснения KPI (legacy). |
| POST | `/dashboard/explain-kpi` | Прокси к AI Service explain-kpi; возвращает explanation и isMock. |
| GET | `/dashboard/satellite/timelapse` | Спутниковые снимки по годам для AOI (Sentinel-2 L2A). Параметры: polygon (JSON [lat,lng]), country, crop, year, product (truecolor \| ndvi). Ответ: year_used, years: [{year, imageUrl, cloudHint, compositeWindow, source}], baseline: {imageUrl, yearsUsed}. Кэш по hash(AOI)+product+year+crop, TTL 24ч. |
| GET | `/dashboard/satellite/preview` | Один снимок за период. Параметры: polygon или bbox, date_from, date_to, product. Ответ: imageUrl (base64), compositeWindow, source, cloudHint. |

**Satellite Evidence — откуда взять учётную запись и куда вставить:**

1. **Регистрация:** зайдите на [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/), нажмите на аватар (правый верх), зарегистрируйтесь и подтвердите email.
2. **OAuth-клиент:** откройте [Dashboard → User Settings](https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings), раздел **OAuth clients** → **Create**. Укажите имя клиента и срок действия (или «Never expire»). Нажмите **Create** и **сразу скопируйте** Client ID и Client Secret (секрет потом нельзя посмотреть).
3. **Куда вставить:** создайте или отредактируйте файл **`backend/services/dashboard/.env`** и добавьте две строки (подставьте свои значения):
   ```
   CDS_CLIENT_ID=ваш_client_id_из_дашборда
   CDS_CLIENT_SECRET=ваш_client_secret_из_дашборда
   ```
   Альтернативные имена переменных: `SENTINEL_HUB_CLIENT_ID` и `SENTINEL_HUB_CLIENT_SECRET`.
4. Перезапустите Dashboard (`uvicorn app:app --port 8000`). После этого модуль «Satellite Evidence» на странице анализа будет подгружать снимки Sentinel-2 L2A. Без этих переменных снимки не появятся, в интерфейсе будет сообщение об ошибке.

**Зависимости:** Risk Service (`RISK_SERVICE_URL`), AI Service (`AI_SERVICE_URL`), датасет (`DATASET_PATH`), конфиг и GeoJSON-районы (опционально). При недоступности Risk — 503; при недоступности AI — fallback-советы и mock объяснения.

---

### Risk Service

- **Порт:** 8002 (по умолчанию).
- **Назначение:** ML-модели (LightGBM, квантильная регрессия) для прогноза аномалии урожая и категории риска. Использует `backend/deployment`: inference.py, model_p10/p50/p90.joblib, config.json.

**Эндпоинты:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Название сервиса, docs, health, список endpoints. |
| GET | `/health` | status, models_loaded. |
| POST | `/predict` | Предсказание для одного наблюдения. Тело: region_id, year, crop, features (словарь фичей). Ответ: p10, p50, p90, spread, risk_category. |

**Переменные:** `DEPLOYMENT_DIR` — путь к папке с inference и моделями. При старте загружается `RiskScorer`; при не загруженных моделях POST /predict возвращает 503.

---

### AI Service

- **Порт:** 8001 (по умолчанию).
- **Назначение:** генерация текстов через Gemini API: советы по рискам, агро-рекомендации, структурированные объяснения KPI.

**Эндпоинты:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Название сервиса, docs, health, список endpoints. |
| GET | `/health` | status: ok. |
| GET | `/env-check` | Диагностика: GEMINI_API_KEY_set, GEMINI_MODEL (без раскрытия ключа). |
| POST | `/tips` | Советы по метрикам (country, year, crop, risk_score, p50, p10, p90, spread, risk_category, lang). Ответ: tips (массив строк). При ошибке Gemini — fallback-советы. |
| POST | `/recommend` | Агро-рекомендации по региону/культуре/NDVI/риску и т.д. Ответ: riskAssessment, immediateActions, seasonalOutlook, resourceOptimization, raw. |
| POST | `/explain-kpi` | Объяснение одной KPI-карточки (scope, card_id, metrics, language). Ответ: explanation, isMock. |
| POST | `/explain-kpi-structured` | Структурированное объяснение KPI (JSON с title, subtitle, metrics, sections, next_actions и т.д.). |

**Переменные:** `GEMINI_API_KEY` (обязательно), `GEMINI_MODEL` (по умолчанию gemini-2.5-flash). При недоступности API или ошибке ответа возвращаются fallback-тексты и isMock: true где применимо.

---

## Запуск

**Фронтенд (из корня проекта):**

```bash
npm install
npm run dev
```

Откройте http://localhost:3000. API по умолчанию — `NEXT_PUBLIC_DASHBOARD_API_URL=http://localhost:8000`.

**Бэкенд (три сервиса):**

См. [backend/README.md](backend/README.md): переменные окружения, запуск по отдельности (AI на 8001, Risk на 8002, Dashboard на 8000) или скриптом `backend/scripts/run-all-services.ps1`.

**Правило:** при изменении любого API-метода на бэкенде нужно обновлять системный анализ (описание эндпоинта и потока данных) в этом README или в backend/README.md.

---

## Адаптивная вёрстка (layout)

Глобального масштабирования по высоте экрана **нет** (без letterbox и transform: scale). Design baseline — **360px** по ширине; вёрстка адаптивная: breakpoint'ы compact/regular/expanded, класс `.content` для центрированной колонки, `html { font-size: clamp(...) }`, safe area через `env(safe-area-inset-*)`. Модуль `lib/layout-scale.tsx` даёт только breakpoint, размеры viewport и safe area. Диагностика: `NEXT_PUBLIC_DEBUG_LAYOUT=true` — панель с viewport и breakpoint.

Подробно: [docs/LAYOUT-SCALING.md](docs/LAYOUT-SCALING.md).
