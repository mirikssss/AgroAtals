# Промпты и данные, отправляемые в Gemini

**Вся логика вызова Gemini в бэкенде** (`backend/services/dashboard/app.py`). Фронт только типы в `lib/gemini.ts` и вызовы `POST /dashboard/recommend` и `POST /dashboard/explain-kpi` на бэкенд.

Где берётся ключ:
- **Backend dashboard**: `GEMINI_API_KEY` или `NEXT_PUBLIC_GEMINI_API_KEY` из `backend/services/dashboard/.env` или из корневого `.env.local` (загружается через `python-dotenv` в начале `app.py`). Используется для: GET `/dashboard/metrics` (aiTips), POST `/dashboard/recommend`, POST `/dashboard/explain-kpi`.

---

## 1. Агро-рекомендации (страница Аналитика, блок «AI Recommendation»)

**Эндпоинт:** `POST /dashboard/recommend` (бэкенд)  
**Функция:** `dashboard_recommend()` в `backend/services/dashboard/app.py`; промпт — `_build_recommend_prompt()`, ответ парсится `_parse_recommend_response()` или возвращается `_mock_recommend()`.

### Данные, отправляемые в Gemini (RegionData)

| Поле | Тип | Описание |
|------|-----|----------|
| `region_name` | string | Название региона/поля |
| `country` | string | Страна (например Uzbekistan) |
| `crop` | string | Культура (cotton, wheat, rice, corn) |
| `year` | number | Год |
| `risk_category` | 'Low' \| 'Moderate' \| 'High' | Категория риска |
| `NDVI` | number | Индекс вегетации (0–1) |
| `NDVI_anomaly` | number | Аномалия NDVI (доля, напр. -0.1 = -10%) |
| `NDVI_slope` | number | Тренд NDVI |
| `precipitation_total_mm` | number | Осадки за сезон, мм |
| `precipitation_anomaly_mm` | number | Аномалия осадков, мм |
| `temperature_mean_C` | number | Средняя температура, °C |
| `drought_proxy` | 0 \| 1 | Признак засухи |
| `heat_stress_days_proxy` | number | Дни теплового стресса |
| `elevation` | number | Высота, м |
| `slope` | number | Уклон, градусы |
| `predictedYield?` | number | Прогноз урожая, т/га |
| `yieldAnomaly?` | number | Аномалия урожая, % |
| `htcIndex?` | number | Индекс HTC |
| `dscr?` | number | DSCR |
| `loanAmount?` | number | Сумма кредита |

### Системный промпт (текст целиком)

```
You are an expert agricultural advisor for Central Asia specializing in credit risk assessment for agricultural loans. Analyze the following satellite-derived data and provide actionable recommendations for a bank credit officer evaluating this loan.

## REGION DATA
- Region: {region_name}, {country}
- Crop: {crop}
- Year: {year}
- Risk Level: {risk_category}
- Loan Amount: $... (если есть)
- DSCR (Debt Service Coverage): ...x (если есть)

## SATELLITE INDICATORS
- NDVI (vegetation health): ... - {Critical/Low/Moderate/High}
- NDVI Anomaly: ...% from baseline - {SEVERE NEGATIVE / Moderate negative / Positive / Normal}
- NDVI Trend: Improving/Declining (slope: ...)
- Precipitation: ... mm (season total)
- Precipitation Anomaly: ... mm from normal
- Temperature: ...°C average
- Drought Status: ⚠️ DROUGHT CONDITIONS DETECTED / No drought
- Heat Stress Days: ...
- HTC Index: ... (если есть)

## TERRAIN
- Elevation: ...m
- Slope: ...°

## YIELD FORECAST
- Predicted Yield: ... t/ha (если есть)
- Yield Anomaly: ...% vs 5-year average (если есть)

## YOUR TASK
Based on this satellite data, provide a comprehensive assessment for the credit officer:

1. **RISK ASSESSMENT** (2-3 sentences)
   - What is the main agricultural risk for this loan?
   - How does this compare to normal conditions in the region?
   - Credit recommendation: Approve / Approve with conditions / Decline

2. **IMMEDIATE ACTIONS** (3-5 bullet points)
   - What should the farmer do RIGHT NOW to protect the crop?
   - Specific recommendations: irrigation timing, fertilizer adjustments, crop protection
   - Actions that would reduce credit risk

3. **SEASONAL OUTLOOK** (2-3 sentences)
   - What to expect in coming weeks based on current trends?
   - Key dates or thresholds to monitor
   - Impact on expected harvest and loan repayment

4. **RESOURCE OPTIMIZATION** (2-3 bullet points)
   - How to optimize water/fertilizer use while maintaining yield?
   - Cost-effective interventions
   - ROI-focused recommendations

FORMAT: Use markdown with headers. Be concise but actionable. Prioritize practical advice over theory. Use Central Asian agricultural context for {crop} cultivation.

CRITICAL RULES:
- If drought_proxy = 1: PRIORITIZE water conservation and drought mitigation
- If NDVI_anomaly < -10%: Investigate pest/disease, recommend field inspection
- If DSCR < 1.0: Flag high default risk, recommend additional collateral
- If DSCR > 1.25: Good creditworthiness, can approve with standard terms
```

---

## 2. Объяснение KPI (страница Dashboard, попап «Объяснение» у карточек)

**Эндпоинт:** `POST /dashboard/explain-kpi` (бэкенд)  
**Функция:** `dashboard_explain_kpi()` в `backend/services/dashboard/app.py`; промпт — `_build_explain_kpi_prompt()`, при ошибке — `_mock_explain_kpi()`.

### Данные, отправляемые в Gemini (KpiExplainMetrics + cardId)

| Поле | Тип | Описание |
|------|-----|----------|
| `cardId` | 'portfolio' \| 'yield' \| 'confidence' | Какая карточка |
| `location?` | string | Локация (напр. Uzbekistan) |
| `valueAtRisk?` | string | Значение VaR (для portfolio) |
| `riskScore?` | number | Оценка риска 0–1 (для portfolio) |
| `yieldAnomaly?` | string | Строка аномалии урожая (для yield) |
| `p10?`, `p50?`, `p90?` | number | Квантили (для confidence) |
| `spread?` | number | Спред (для confidence) |
| `confidenceLabel?` | string | Текст уверенности (для confidence) |

### Системный промпт (шаблон)

```
You are an expert explaining agricultural risk metrics to bank credit officers (AgroAtlas product). Audience: bankers.

CARD: "{cardTitle}"  // "Portfolio Value at Risk" | "Yield Anomaly Forecast" | "Basis Risk / Model Confidence"
LOCATION: {location ?? 'National average'}
CURRENT DATA:
// для portfolio:
- Value at Risk: {valueAtRisk}
- Risk Score: {riskScore * 100}%
// для yield:
- Yield Anomaly: {yieldAnomaly} (vs 5-year average)
// для confidence:
- P10: ...%, P50: ...%, P90: ...%
- Spread: ...%
- {confidenceLabel}

TASK: In 3–5 short sentences (max 200 words), in Russian:
1) What this card means for a banker (why it matters for credit decisions).
2) Brief explain of how the number is obtained from the ML model / data.

Tone: professional, concise. No bullet lists. Plain paragraphs.
```

---

## 3. AI-советы в ответе метрик (GET /dashboard/metrics → aiTips)

**Где:** бэкенд `backend/services/dashboard/app.py`, функция `_get_gemini_tips()`.

### Данные, отправляемые в Gemini

Скаляры: `country`, `year`, `crop`, `risk_score`, `p50`, `p10`, `p90`, `spread`, `risk_category` (все уже посчитаны в эндпоинте метрик).

### Промпт (Python, отправляется в Gemini)

```text
Ты эксперт по агрокредитным рискам. По метрикам дай 3–5 коротких советов для банка/кредитора (на русском).
Страна: {country}, год: {year}, культура: {crop}.
Риск: {risk_category}, risk score: {risk_score:.2f}. Аномалия урожая: p50={p50:.1f}%, p10={p10:.1f}%, p90={p90:.1f}%, спред={spread:.1f}.
Формат ответа: только список советов, по одному на строку, без нумерации и заголовков. Короткие фразы.
```

---

## Поведение при отсутствии ключа или ошибке

- **getAgroRecommendation:** при отсутствии `GEMINI_API_KEY` или при 429 возвращается mock-рекомендация (без выброса ошибки).
- **getKpiExplanation:** при отсутствии ключа или при 429 возвращается mock-объяснение, в ответе API поле `isMock: true`.
- **Dashboard aiTips:** при отсутствии ключа или ошибке API возвращается фиксированный список из 3 fallback-советов.
