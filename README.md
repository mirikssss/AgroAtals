# AgroAtlas Analytics Map

**Правило:** при изменении любого API-метода (бэкенд) нужно обновлять его системный анализ (СА) в этом README.

---

## Мини системный анализ: `GET /dashboard/kpi-cards`

Эндпоинт отдаёт агрегированные KPI для «risk cockpit»: одна пространственная единица (страна, область или район) — один набор карточек. KPI должны реально меняться при смене country → oblast → district, crop и year. Никаких глобальных fallback mean — только иерархический fallback. DSCR считается в Dashboard; Risk Service используется **только** для p10, p50, risk_category.

### Назначение

- Показать на дашборде четыре метрики: **аномалия урожая (p50)**, **downside-риск (p10)**, **доля портфеля по риску**, **DSCR (p50/p10 и статус)**.
- Используется фронтом при выборе страны/региона/района и культуры для подстановки данных в KPI-карточки.

### Пространственная агрегация и выбор года

1. **`_filter_dataset(df, country, region_level, region_id, crop, year)`**  
   - Фильтр по стране и культуре: `df["country_iso"] == country`, `df["crop"] == crop`.  
   - Фильтр по региону:  
     - `region_level == "country"` → не фильтруем по области/району.  
     - **`oblast`:** в датасете в `region_name` лежат названия **районов/городов**, а фронт присылает имя области («Toshkent viloyati»). Поэтому для oblast не делаем точное сравнение с одной ячейкой — берём список районов этой области из GeoJSON (`_load_region_districts_cached(region_id)`) и фильтруем строки, у которых `region_name` (нормализованный) входит в этот список. Так по разным областям получаются разные подвыборки и разные KPI.  
     - **`district`:** фильтр по `district_name` или `region_name` (точное или нормализованное совпадение с `region_id`).  
   - Год не «тупо year == X»: вызывается **`_select_nearest_year(df, year)`**.

2. **`_select_nearest_year(df, year)`**  
   - Если запрошенный год есть в `df["year"]` → использовать его.  
   - Иначе — взять `max(year < requested_year)` из доступных.  
   - Если подходящего года нет → вернуть пустой датафрейм и флаг (нет fallback на global).

3. **Иерархический fallback (при пустом результате после фильтрации)**  
   - **district** → повторить на уровне **oblast**.  
   - **oblast** → повторить на уровне **country**.  
   - **country** → **NO DATA** (404, без synthetic/zeros/global mean).  
   В ответе в `meta` возвращаются `fallback` (`"none"` | `"oblast"` | `"country"`) и `data_confidence` (`"high"` | `"low"`).

### Формирование фичей и вызов Risk Service

4. **`_compute_features(df_region, feature_cols)`**  
   - Mean по колонкам из `config.json` → `feature_cols`.  
   - **Вырожденная дисперсия:** при малом числе строк (≤5) нулевая/малая дисперсия ожидаема — исключение не выбрасывается. При большем числе строк, если у большинства фичей std < 1e-6, пишется **WARNING** в лог и возвращаются средние (без 500). После расчёта, если `mean_std < 1e-5`, в ответе выставляется `meta["data_confidence"] = "low"`.  
   - Логирование: `KPI features rows=... year=... mean_std=...`.

5. **Risk Service (один вектор)**  
   - Payload: `{ region_id, year: year_used, crop, features }`.  
   - Ответ используется **только** для: `p50`, `p10`, `risk_category`.  
   - Если `p50 ≈ p10` → логируется WARNING.

6. **Satellite baseline (для Vegetation/Season Stress)**  
   - Берётся тот же scope (country/oblast/district + crop), но **по всем годам ≤ year_used** (берём последние 5 лет, если доступно).  
   - Если лет < 3, делается иерархический fallback: district → oblast → country.  
   - Если после fallback всё равно < 3 лет → **HTTP 404** (`No satellite baseline available`).

### DSCR и риск-шейр в Dashboard

7. **DSCR** — `_dscr_from_yield_anomaly(pct, crop, loan_per_ha, rate_pct, years)`  
   - Эталон на 1 га: `BASE_YIELD_T_HA[crop]`, `PRICE_PER_TON[crop]`, `COST_RATIO` (NOI = выручка × (1 − cost_ratio)), annual_debt_service по loan/rate/years.  
   - DSCR = NOI / annual_debt_service (для p50 и p10).

8. **DSCR status (банковская логика)**  
   - `p50 >= 1.25` и `p10 >= 1.0` → `"healthy"`.  
   - `p50 >= 1.0` → `"borderline"`.  
   - Иначе → `"stress"`.

9. **Risk share** — `_risk_share_from_category(cat)`: High → { high: 100, … }, и т.д.  
   - В ответе **обязательно** поле `"method": "single-region proxy"` (это не портфельная доля по кредитам, а прокси по категории риска одной единицы). В коде есть TODO: заменить на portfolio-weighted distribution, когда появится таблица кредитов.

10. **scope_hash в meta** — строка вида `"UZB|Toshkent viloyati|wheat|2023"` (country|region_id|crop|year_used). Логируется в каждом ответе; если разные запросы дают один и тот же scope_hash при разных region_id — признак бага.

11. **DSCR sanity-check** — если `dscr_p50 < 0.5` или `dscr_p50 > 3.0`, логируется **WARNING** (не ошибка; сигнал проверить цену/cost_ratio/yield).

### Диагностическое логирование

- После расчёта фичей: `KPI features rows=%d year=%d mean_std=%.4f`.  
- При p50 ≈ p10: WARNING.  
- После ответа: `KPI result: scope_hash=%s region=... level=... crop=... p50=... p10=... dscr50=...` (scope_hash логируется).  
- DSCR вне [0.5, 3.0]: WARNING.  
- `SAT_KPI baseline: scope_hash=... baseline_rows=... baseline_years=... fallback=...`  
- `SAT_KPI values: scope_hash=... ndvi_cur=... score=... stress=... components=...`  
- Если для разных регионов (в рамках одного scope) одинаковые p50 и dscr_p50 → **CRITICAL** (анти-баг защита).

### Входные параметры (query)

| Параметр       | Тип    | По умолчанию | Описание |
|----------------|--------|--------------|----------|
| `country`      | string | `UZB`        | Код страны (ISO). |
| `region_level` | string | `country`    | Уровень: `country`, `oblast`, `district`. |
| `region_id`    | string | —            | Имя области или района (обязателен при `oblast`/`district`). |
| `crop`         | string | `wheat`      | Культура. |
| `year`         | int    | текущий год  | Год прогноза. |

Пример:  
`GET /dashboard/kpi-cards?country=UZB&region_level=oblast&region_id=Toshkent%20viloyati&crop=wheat&year=2026`

### Выходные данные (JSON)

- `yield_anomaly_p50`: `{ value, unit: "%", trend: "positive"|"neutral"|"negative" }`.
- `downside_risk_p10`: `{ value, unit: "%", min_p10 }`.
- `portfolio_risk_share`: `{ high, moderate, low }` (пока одна категория = 100, остальные 0).
- `dscr`: `{ p50, p10, status: "healthy"|"borderline"|"stress" }`.
- `vegetation_health`: `{ value: 0..1, status: "good"|"watch"|"poor", ndvi_current, ndvi_baseline_p10, ndvi_baseline_p90 }` или `null`. **value** — перцентильный ранг: доля лет в baseline, где NDVI ≤ текущий (даёт вариацию по регионам).
- `season_stress`: `{ value: 0..1, level: "low"|"medium"|"high", components: { drought, heat, ndvi_drop } }` или `null`. **components**: drought и heat — непрерывные 0..1; ndvi_drop — 0 или 1.
- **`meta`**: `{ rows_used, year_used, fallback, data_confidence, scope_hash, baseline_fallback, baseline_years_used, satellite_warning?, ndvi_prev_missing? }`.  
- **`portfolio_risk_share`** всегда содержит `"method": "single-region proxy"`.

### Кэширование

- Кэширование отключено: каждый запрос приводит к пересчёту (фильтрация датасета, вызов Risk Service, расчёт DSCR).

### Зависимости

- **Risk Service** (`RISK_SERVICE_URL`) — обязателен; при ошибке — 503.
- **Dataset** и **config.json** (`feature_cols`) — обязательны; при пустом наборе после иерархического fallback — 404 (No data for KPI selection).
- Переменные окружения для DSCR: `DSCR_COST_RATIO`, `DSCR_LOAN_PER_HA`, `DSCR_RATE_PCT`, `DSCR_TERM_YEARS`.

### Краткая схема потока

```
Frontend
    → GET /dashboard/kpi-cards?country=&region_level=&region_id=&crop=&year=
Dashboard Service
    → _filter_dataset() → иерархический fallback при пустоте
    → _select_nearest_year() → год (без global fallback)
    → _compute_features(df_region, feature_cols) → при вырождении: warning + data_confidence=low, без 500
    → POST Risk Service /predict → только p50, p10, risk_category
    → _dscr_from_yield_anomaly(..., loan_per_ha, rate_pct, years), _dscr_status(), _risk_share_from_category()
    → диагностические логи (в т.ч. CRITICAL при одинаковых KPI у разных регионов)
    → ответ { yield_anomaly_p50, downside_risk_p10, portfolio_risk_share, dscr, meta }
```

### Логика каждой KPI-карточки (что показываем, откуда, как считаем)

- **Yield Anomaly (p50)**  
  **Что показываем:** медианный прогноз аномалии урожая в процентах (например +9% или −3%).  
  **Откуда:** Risk Service возвращает `p50` по одному вектору фичей (страна/область/район + культура + год).  
  **Как считаем:** фичи готовит Dashboard из dataset (фильтр по стране, культуре, региону, выбор ближайшего года), отправляются в `POST /predict`; значение из ответа показываем как есть; тренд: negative при p50 &lt; −2%, positive при &gt; +2%, иначе neutral.

- **Downside Risk (p10)**  
  **Что показываем:** нижний перцентиль аномалии урожая (худший из 10% сценариев), в %.  
  **Откуда:** тот же вызов Risk Service, поле `p10`.  
  **Как считаем:** без доп. расчёта на фронте — просто отображаем `p10` из API.

- **High Risk Share**  
  **Что показываем:** доля «высокого риска» в виде одного числа (0 или 100).  
  **Откуда:** Risk Service возвращает `risk_category` (High / Moderate_High / Moderate_Low / Low); в ответе API есть `portfolio_risk_share` с полем `method: "single-region proxy"`.  
  **Как считаем:** это не реальная портфельная доля по кредитам — одна выбранная единица (страна/область/район) попадает в одну категорию; мы показываем 100% в этой категории (high/moderate/low). Итог: «High Risk Share» = 100, если категория High, иначе 0.

- **DSCR (p50 / p10)**  
  **Что показываем:** два числа (DSCR по медианному и по пессимистичному сценарию) и статус (healthy / borderline / stress).  
  **Откуда:** считает Dashboard, не Risk Service.  
  **Как считаем:** по эталону на 1 га: базовый урожай и цена по культуре, выручка, NOI = выручка × (1 − cost_ratio), годовой платёж по кредиту (loan_per_ha, rate, срок). DSCR = NOI / annual_debt_service — отдельно для p50 и p10 (подставляем соответствующую аномалию в прогноз урожая). Статус: healthy при DSCR p50 ≥ 1.25 и p10 ≥ 1.0; borderline при p50 ≥ 1.0; иначе stress.

- **Vegetation Health Index (VHI/NDVI Score)**  
  **Что показываем:** нормированный индекс 0..1 + статус (good/watch/poor) + NDVI текущего года и baseline p10/p90.  
  **Откуда:** вычисляется в Dashboard по спутниковым данным (NDVI) из dataset.  
  **Как считаем:** берём `ndvi_current` = среднее NDVI по `df_year` (год `year_used`). Для baseline — NDVI по тем же границам и культуре за несколько лет (<= year_used), агрегируем по годам, считаем p10/p90. Далее `score = (ndvi_current - p10)/(p90 - p10 + 1e-6)` с ограничением [0..1]. Статус: good ≥ 0.7, watch 0.4..0.7, poor < 0.4.

- **Season Stress Index**  
  **Что показываем:** индекс 0..1 + уровень (low/medium/high) + компоненты (drought/heat/ndvi_drop).  
  **Откуда:** вычисляется в Dashboard по climate/satellite прокси из dataset.  
  **Как считаем:**  
  `drought = 1`, если `precipitation_anomaly_mm < -50`;  
  `heat = 1`, если `temperature_mean_C > 25`;  
  `ndvi_drop = 1`, если `NDVI_current < NDVI_prev_year * 0.85` (если предыдущий год есть).  
  Итог: `stress = 0.4*drought + 0.3*heat + 0.3*ndvi_drop` (clamp 0..1). Уровень: low < 0.35, medium 0.35..0.65, high > 0.65.

---

## Логика цветов на карте

Раскраска полигонов (областей/районов) по **аномалии урожая (p50)** в процентах.

- **Источник данных:** для каждого полигона фронт вызывает `GET /dashboard/metrics` с `scope=region` или `scope=district` и `area_name` = имя области/района из GeoJSON. Из ответа берётся число `p50` (если пришло в долях &lt; 1 — умножается на 100). Результаты складываются в `yieldAnomalyByArea[areaName]`.

- **Сопоставление имён:** ключ в `yieldAnomalyByArea` — то же имя, что в свойствах полигона (`name` или `ADM1_EN`). Если имя из запроса не совпадает с именем в GeoJSON, полигон остаётся без данных и заливается нейтральным цветом (полупрозрачный белый).

- **Шкала цветов (getColorByAnomaly):**  
  - **&lt; −15%** — красный (`#FF4D4D`) — критичное падение.  
  - **−15% … −5%** — оранжевый (`#FFA726`) — умеренные потери.  
  - **−5% … +5%** — серый (`#E0E0E0`) — стабильно.  
  - **+5% … +15%** — светло-зелёный (`#66BB6A`) — рост.  
  - **&gt; +15%** — тёмно-зелёный (`#2E7D32`) — сильный рост.

- **Если по региону нет данных:** заливка `rgba(255, 255, 255, 0.15)`.

- **Почему «всё зелёное»:** если бэкенд для всех областей возвращает p50 &gt; 5%, все полигоны попадут в зелёные оттенки. Чтобы видеть различие, нужны разные p50 по регионам (и корректное совпадение имён области в API и на карте). Добавлены два оттенка зелёного (+5…+15% и &gt;+15%), чтобы при положительной аномалии была видна градация.

---

## Зачем на дашборде вызывается `GET /dashboard/metrics`, если карточки от `kpi-cards`?

- **Карточки KPI** заполняются **только** из `GET /dashboard/kpi-cards` (один запрос на выбранную страну/область/район).
- **`GET /dashboard/metrics`** на дашборде используется в двух других сценариях:
  1. **Раскраска карты** — для каждого полигона (области или района) делается отдельный запрос; из ответа берётся только **p50** и по нему задаётся цвет. У `kpi-cards` нет «пакета» по списку районов, поэтому для раскраски в цикле вызывается `metrics`.
  2. **Модалка «Explain»** — при клике по карточке в AI отправляется контекст: `valueAtRisk`, `riskScore`, `yieldAnomaly`, `p10`/`p50`/`p90`, `spread`, `confidenceLabel`. Этот контекст сейчас берётся из одного вызова `metrics` при смене выбора (`selectedDistrictData`). Карточки при этом по-прежнему питаются от `kpi-cards`.

---

## Мини системный анализ: `GET /dashboard/metrics`

Эндпоинт возвращает расширенный набор метрик риска для **одной** пространственной единицы (страна, область или район): перцентили, категория риска, value at risk, AI-советы. Используется для раскраски карты (много вызовов — по одному на полигон), для контекста модалки Explain и в модуле аналитики (страновой прогноз).

### Назначение

- Дать по одной единице: перцентили p10/p50/p90, спред, категорию риска, risk score, value at risk, подпись уверенности и AI-советы.
- На фронте: (1) цикл по областям/районам — из ответа берётся **p50** для цвета полигона; (2) один вызов при выборе региона — результат идёт в контекст **Explain**; (3) модуль аналитики — один вызов по стране для сценария прогноза и выручки.

### Откуда берутся данные

1. **Фичи**  
   Так же, как у `kpi-cards`: dataset + config → `_compute_features()` → один payload (region_id, year, crop, features).

2. **Прогноз**  
   **Risk Service** `POST /predict` — тот же запрос. Из ответа используются: `p50`, `p10`, `p90`, `spread`, `risk_category`.

3. **Локально в Dashboard**  
   - **riskScore** — из `_risk_score_from_category(risk_category)` (числовой балл по категории).  
   - **valueAtRisk** — от объёма экспозиции и доли потерь, зависящей от |p10| (в коде: base_exposure × loss_fraction, формат вида `$X.XM`).  
   - **confidenceLabel** — из `_confidence_label(spread)` по величине спреда.

4. **AI-советы**  
   **AI Service** (`AI_SERVICE_URL`): `POST /tips` с параметрами country, year, crop, risk_score, p50, p10, p90, spread, risk_category, lang. Ответ — список строк `tips`. При недоступности AI возвращаются fallback-советы.

Итого: **прогноз** — Risk Service; **метрики и value at risk** — расчёт в Dashboard; **советы** — AI Service (с fallback).

### Входные параметры (query)

| Параметр    | Тип    | По умолчанию | Описание |
|-------------|--------|--------------|----------|
| `country`   | string | `UZB`        | Код страны (ISO). |
| `year`      | int    | `2024`       | Год прогноза. |
| `crop`      | string | `wheat`      | Культура. |
| `scope`     | string | `country`    | Уровень: `country`, `region` (область), `district` (район). |
| `area_name` | string | —            | Имя области или района (при scope region/district). |
| `lang`      | string | `en`         | Язык для AI-советов. |

Пример:  
`GET /dashboard/metrics?country=UZB&year=2026&scope=district&area_name=Zarafshan+city&crop=wheat`

### Выходные данные (JSON)

- `riskScore` — числовой балл риска по категории.
- `valueAtRisk` — строка вида `$X.XM`.
- `yieldAnomaly` — строка с p50 в процентах, например `"-3.2%"`.
- `p10`, `p50`, `p90` — числа (перцентили аномалии урожая, %).
- `spread` — число (разброс).
- `confidenceLabel` — подпись уверенности по спреду.
- `riskCategory` — строка (High / Moderate_High / Moderate_Low / Low).
- `aiTips` — массив строк (советы от AI или fallback).

### Кэширование

- **Не кэшируется.** Каждый запрос ведёт к вызову Risk Service (и при необходимости AI Service). Поэтому массовый вызов для раскраски карты (по одному на полигон) даёт большую нагрузку; на фронте сделано ограничение параллелизма и отмена при смене выбора.

### Зависимости

- **Risk Service** (`RISK_SERVICE_URL`) — обязателен; при ошибке/таймауте — 503.
- **AI Service** (`AI_SERVICE_URL`) — опционален; при недоступности подставляются fallback-советы.
- **Dataset** и **config** — как для kpi-cards.

### Краткая схема потока

```
Frontend (карта: цикл по area_name ИЛИ один вызов для Explain/аналитики)
    → GET /dashboard/metrics?country=&year=&crop=&scope=&area_name=&lang=
Dashboard Service
    → _compute_features() → payload
    → POST Risk Service /predict → p50, p10, p90, spread, risk_category
    → _risk_score_from_category(), valueAtRisk, _confidence_label()
    → POST AI Service /tips (или fallback) → aiTips
    → ответ { riskScore, valueAtRisk, yieldAnomaly, p10, p50, p90, spread, confidenceLabel, riskCategory, aiTips }
```
