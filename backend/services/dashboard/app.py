from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import ssl
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional

# Загружаем .env: сначала папка dashboard, потом корень проекта (для GEMINI_API_KEY)
from dotenv import load_dotenv
_dashboard_dir = Path(__file__).resolve().parent  # backend/services/dashboard
_project_root = _dashboard_dir.parent.parent.parent  # backend -> services -> backend -> project root
load_dotenv(_dashboard_dir / ".env")
load_dotenv(_project_root / ".env.local")


def _suppress_cancelled_error_filter(record: logging.LogRecord) -> bool:
    """Suppress ERROR logs from asyncio.CancelledError during uvicorn --reload shutdown."""
    if record.levelno < logging.ERROR:
        return True
    # Check exception chain (Python 3 exception chaining)
    exc_type, exc_val, exc_tb = record.exc_info or (None, None, None)
    while exc_type is not None:
        if exc_type is asyncio.CancelledError or exc_type is KeyboardInterrupt:
            return False
        exc_val = getattr(exc_val, "__context__", None)
        exc_type = type(exc_val) if exc_val is not None else None
    if "CancelledError" in (record.getMessage() or ""):
        return False
    return True


for _name in ("uvicorn.error", "uvicorn", "starlette.routing", ""):
    _log = logging.getLogger(_name) if _name else logging.root
    _log.addFilter(_suppress_cancelled_error_filter)
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
DEPLOYMENT_DIR = Path(os.environ.get("DEPLOYMENT_DIR", BACKEND_DIR / "deployment"))
DATASET_PATH = Path(os.environ.get("DATASET_PATH", DEPLOYMENT_DIR / "dataset.csv"))
DISTRICTS_DIR = Path(os.environ.get("DISTRICTS_DIR", PROJECT_ROOT / "public" / "districts"))

if not DEPLOYMENT_DIR.exists():
    raise RuntimeError(f"Deployment directory not found: {DEPLOYMENT_DIR}")
if not DATASET_PATH.exists():
    raise RuntimeError(f"Dataset file not found: {DATASET_PATH}")

os.environ.setdefault("NUMEXPR_MAX_THREADS", "8")

import sys  # noqa: E402

sys.path.append(str(DEPLOYMENT_DIR))
from inference import RiskScorer  # type: ignore  # noqa: E402


app = FastAPI(title="AgroAtlas Dashboard Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scorer = RiskScorer(DEPLOYMENT_DIR)
df = pd.read_csv(DATASET_PATH)


REGION_FILE_MAP: dict[str, str] = {
    "Toshkent sh.": "toshkent",
    "Toshkent viloyati": "toshkent",
    "Namangan viloyati": "namangan",
    "Farg'ona viloyati": "fargona",
    "Andijon viloyati": "andijon",
    "Sirdaryo viloyati": "sirdaryo",
    "Jizzax viloyati": "jizzax",
    "Navoiy viloyati": "navoiy",
    "Samarqand viloyati": "samarqand",
    "Qashqadaryo viloyati": "qashqadaryo",
    "Surxondaryo viloyati": "surxondaryo",
    "Buxoro viloyati": "buxoro",
    "Xorazm viloyati": "xorazm",
    "Qoraqalpogʻiston Respublikasi": "qoraqalpogiston",
}


def _normalize_name(value: str) -> str:
    v = str(value).lower()
    for ch in ["’", "ʻ", "ʼ", "`", "´"]:
        v = v.replace(ch, "'")
    v = "".join([c if c.isalnum() or c == " " else " " for c in v])
    v = " ".join(v.split())
    return v


@lru_cache(maxsize=64)
def _load_region_districts(region_name: str) -> list[str]:
    file_name = REGION_FILE_MAP.get(region_name)
    if not file_name:
        return []
    path = DISTRICTS_DIR / f"{file_name}.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    districts: list[str] = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name = props.get("NAME_2") or props.get("NAME_3") or props.get("NAME_1") or props.get("name")
        if name:
            districts.append(str(name))
    return districts


def _safe_contains(series: pd.Series, value: str) -> pd.Series:
    return series.astype(str).str.contains(value, case=False, na=False)


def _risk_score_from_category(risk_category: str) -> float:
    mapping = {
        "High": 0.85,
        "Moderate_High": 0.7,
        "Moderate_Low": 0.5,
        "Low": 0.25,
    }
    return mapping.get(risk_category, 0.5)


def _confidence_label(spread: float) -> str:
    if spread >= 10:
        return "High uncertainty (wide quantile spread)"
    if spread >= 5:
        return "Moderate uncertainty"
    return "Low uncertainty (tight quantile spread)"


def _fallback_ai_tips() -> list[str]:
    """Fallback AI tips when Gemini is unavailable (no key or API error)."""
    return [
        "Мониторить динамику урожайности по спутниковым данным.",
        "Учитывать спред квантилей (p10–p90) при решении о кредите.",
        "При отрицательной аномалии урожая рассмотреть страховку или резерв.",
    ]


def _lang_instruction(lang: str) -> str:
    """Instruction for Gemini: answer in selected language."""
    lang = (lang or "en").lower()[:2]
    if lang == "ru":
        return "Отвечай только на русском."
    if lang == "uz":
        return "Javobni faqat o'zbek tilida bering."
    return "Answer in English only."


def _get_gemini_tips(
    country: str,
    year: int,
    crop: str,
    risk_score: float,
    p50: float,
    p10: float,
    p90: float,
    spread: float,
    risk_category: str,
    lang: str = "en",
) -> list[str]:
    """Call Gemini API for 3–5 short actionable tips (list[str]). Returns fallback on error or no key."""
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("NEXT_PUBLIC_GEMINI_API_KEY") or "").strip()
    if not api_key:
        return _fallback_ai_tips()

    model = "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    lang_instr = _lang_instruction(lang)
    prompt = f"""Ты — советник банкира по агрокредитным рискам. Дай 3–5 коротких советов для кредитного решения. {lang_instr}

Контекст: страна {country}, год {year}, культура {crop}. Категория риска: {risk_category}, risk score: {risk_score:.2f}. Аномалия урожая: p50={p50:.1f}%, p10={p10:.1f}%, p90={p90:.1f}%, спред={spread:.1f}.

Формат: только список советов, по одному на строку, без нумерации и заголовков. Короткие фразы."""

    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 400},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ],
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        if isinstance(e, urllib.error.HTTPError):
            if e.code == 429:
                print("[dashboard/metrics] Gemini 429 (quota), using fallback tips")
            elif e.code == 403:
                print("[dashboard/metrics] Gemini 403 (Forbidden). Check GEMINI_API_KEY and enable Generative Language API.")
            else:
                print("[dashboard/metrics] Gemini error:", e.code, getattr(e, "reason", e))
        else:
            print("[dashboard/metrics] Gemini error:", getattr(e, "reason", e))
        return _fallback_ai_tips()

    try:
        candidates = data.get("candidates") or []
        if not candidates:
            return _fallback_ai_tips()
        parts = candidates[0].get("content", {}).get("parts") or []
        text = "".join(p.get("text", "") or "" for p in parts if isinstance(p, dict)).strip()
    except (IndexError, KeyError, TypeError):
        return _fallback_ai_tips()

    if not text:
        return _fallback_ai_tips()

    lines = [s.strip() for s in re.split(r"[\n•\-]", text) if s.strip() and len(s.strip()) > 10]
    lines = [re.sub(r"^\d+[\.\)]\s*", "", s) for s in lines]
    tips = list(dict.fromkeys(lines))[:5]
    return tips if tips else _fallback_ai_tips()


def _call_gemini(
    prompt: str,
    temperature: float = 0.7,
    max_output_tokens: int = 1024,
) -> Optional[str]:
    """Call Gemini API; return response text or None on error/quota."""
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("NEXT_PUBLIC_GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None
    model = "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_output_tokens},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ],
    }).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        if isinstance(e, urllib.error.HTTPError):
            if e.code == 429:
                print("[Gemini] 429 (quota), using fallback")
            elif e.code == 403:
                print("[Gemini] 403 (Forbidden). Check GEMINI_API_KEY and enable Generative Language API.")
            else:
                print("[Gemini] error:", e.code, getattr(e, "reason", e))
        else:
            print("[Gemini] error:", getattr(e, "reason", e))
        return None
    try:
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts") or []
        if not parts:
            return None
        # Собираем текст из всех parts (Gemini может вернуть несколько частей)
        text_parts = [p.get("text", "") or "" for p in parts if isinstance(p, dict)]
        result = "".join(text_parts).strip()
        return result or None
    except (IndexError, KeyError, TypeError):
        return None


def _build_recommend_prompt(d: dict[str, Any]) -> str:
    ndvi = float(d.get("NDVI", 0.5))
    ndvi_status = "Critical (bare soil/stressed)" if ndvi < 0.3 else "Low (sparse vegetation)" if ndvi < 0.5 else "Moderate (healthy vegetation)" if ndvi < 0.7 else "High (dense vegetation)"
    anomaly = float(d.get("NDVI_anomaly", 0))
    anomaly_status = "SEVERE NEGATIVE" if anomaly < -0.1 else "Moderate negative" if anomaly < -0.05 else "Positive" if anomaly > 0.05 else "Normal"
    drought = "DROUGHT CONDITIONS DETECTED" if d.get("drought_proxy") == 1 else "No drought"
    slope = float(d.get("NDVI_slope", 0))
    trend = "Improving" if slope > 0 else "Declining"
    prec = float(d.get("precipitation_total_mm", 300))
    prec_anom = float(d.get("precipitation_anomaly_mm", 0))
    temp = float(d.get("temperature_mean_C", 25))
    heat = int(d.get("heat_stress_days_proxy", 0))
    elev = int(d.get("elevation", 400))
    sl = float(d.get("slope", 2))
    region = d.get("region_name", "Unknown")
    country = d.get("country", "Uzbekistan")
    crop = d.get("crop", "cotton")
    year = int(d.get("year", 2024))
    risk = d.get("risk_category", "Moderate")
    loan_line = f"- Loan Amount: ${int(d.get('loanAmount', 0)):,}\n" if d.get("loanAmount") else ""
    dscr_line = f"- DSCR (Debt Service Coverage): {float(d.get('dscr', 0)):.2f}x\n" if d.get("dscr") else ""
    htc_line = f"- HTC Index: {float(d.get('htcIndex', 0)):.2f} (< 0.7 indicates drought stress)\n" if d.get("htcIndex") is not None else ""
    pred_line = f"- Predicted Yield: {float(d.get('predictedYield', 0)):.1f} t/ha\n" if d.get("predictedYield") is not None else ""
    yield_anom = d.get("yieldAnomaly")
    yield_line = f"- Yield Anomaly: {float(yield_anom):+.1f}% vs 5-year average\n" if yield_anom is not None else ""
    lang = (d.get("language") or "en").lower()[:2]
    lang_instr = _lang_instruction(lang)
    return f"""Ты — советник банкира по агрокредитам в Центральной Азии. Твоя роль: помочь кредитному офицеру принять решение по займу на основе спутниковых и агрометрик. {lang_instr} Структура ответа: 4 блока с буллетами (см. ниже).

## REGION DATA
- Region: {region}, {country}
- Crop: {crop}
- Year: {year}
- Risk Level: {risk}
{loan_line}{dscr_line}

## SATELLITE INDICATORS
- NDVI (vegetation health): {ndvi:.3f} - {ndvi_status}
- NDVI Anomaly: {anomaly * 100:.1f}% from baseline - {anomaly_status}
- NDVI Trend: {trend} (slope: {slope:.4f})
- Precipitation: {prec:.0f} mm (season total)
- Precipitation Anomaly: {prec_anom:+.0f} mm from normal
- Temperature: {temp:.1f}°C average
- Drought Status: {drought}
- Heat Stress Days: {heat}
{htc_line}

## TERRAIN
- Elevation: {elev}m
- Slope: {sl:.1f}°

## YIELD FORECAST
{pred_line}{yield_line}

## YOUR TASK
Based on this satellite data, provide a comprehensive assessment for the credit officer. Use bullet points (thesis format) for ALL four sections, like Immediate Actions.

1. **RISK ASSESSMENT** (3-5 bullet points)
   - Main agricultural risk for this loan
   - Comparison to normal conditions in the region (NDVI, yield anomaly, precipitation)
   - Credit recommendation: Approve / Approve with conditions / Decline (as a separate bullet)

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

FORMAT: Use exactly these 4 bold headers (copy them) and write content under each. Be concise but actionable.
**1. RISK ASSESSMENT**
**2. IMMEDIATE ACTIONS**
**3. SEASONAL OUTLOOK**
**4. RESOURCE OPTIMIZATION**

CRITICAL RULES:
- If drought_proxy = 1: PRIORITIZE water conservation and drought mitigation
- If NDVI_anomaly < -10%: Investigate pest/disease, recommend field inspection
- If DSCR < 1.0: Flag high default risk, recommend additional collateral
- If DSCR > 1.25: Good creditworthiness, can approve with standard terms"""


def _parse_recommend_response(text: str) -> dict[str, str]:
    clean = text.replace("\r\n", "\n").strip()
    sections = {"riskAssessment": "", "immediateActions": "", "seasonalOutlook": "", "resourceOptimization": "", "raw": text}

    def assign(name: str, content: str) -> None:
        if not content or len(content.strip()) < 5:
            return
        name_upper = name.upper().strip()
        if "RISK" in name_upper and "ASSESS" in name_upper:
            sections["riskAssessment"] = content.strip()
        elif "IMMEDIATE" in name_upper or "ACTION" in name_upper:
            sections["immediateActions"] = content.strip()
        elif "SEASON" in name_upper or "OUTLOOK" in name_upper:
            sections["seasonalOutlook"] = content.strip()
        elif "RESOURCE" in name_upper or "OPTIM" in name_upper:
            sections["resourceOptimization"] = content.strip()

    # 1) Bold numbered headers: **1. RISK ASSESSMENT** ... **2. IMMEDIATE ACTIONS** ...
    for m in re.finditer(r"\*\*(\d+)\.\s*([A-Z\s]+)\*\*\s*\n?([\s\S]*?)(?=\*\*\d+\.|$)", clean, re.I | re.DOTALL):
        assign(m.group(2).strip(), m.group(3).strip())
    # 2) Markdown ## headers
    if not sections["immediateActions"]:
        for m in re.finditer(r"#{1,3}\s*(?:\d+\.)?\s*([A-Z][A-Za-z\s]+)\s*\n([\s\S]*?)(?=#{1,3}\s|\*\*\d+\.|$)", clean, re.I | re.DOTALL):
            assign(m.group(1).strip(), m.group(2).strip())
    # 3) Bold **HEADER** without number
    if not sections["immediateActions"]:
        for m in re.finditer(r"\*\*([A-Z][A-Za-z\s]+)\*\*[:\s]*\n?([\s\S]*?)(?=\*\*[A-Z0-9]|$)", clean, re.I | re.DOTALL):
            assign(m.group(1).strip(), m.group(2).strip())
    # 4) Fallback: split by double newline
    if not sections["riskAssessment"] or (not sections["immediateActions"] and "\n\n" in clean):
        paras = [p.strip() for p in clean.split("\n\n") if p.strip() and len(p.strip()) > 15]
        if len(paras) >= 4:
            sections["riskAssessment"] = sections["riskAssessment"] or paras[0]
            sections["immediateActions"] = sections["immediateActions"] or "\n\n".join(paras[1 : (len(paras) + 1) // 2])
            sections["seasonalOutlook"] = sections["seasonalOutlook"] or paras[(len(paras) + 1) // 2]
            sections["resourceOptimization"] = sections["resourceOptimization"] or "\n\n".join(paras[-1:])
        elif paras and not sections["riskAssessment"]:
            sections["riskAssessment"] = "\n\n".join(paras)
    return sections


def _mock_recommend(d: dict[str, Any]) -> dict[str, str]:
    risk_cat = (d.get("risk_category") or "Moderate").lower()
    anomaly = float(d.get("NDVI_anomaly", 0))
    is_high = risk_cat == "high" or anomaly < -0.1
    is_drought = d.get("drought_proxy") == 1
    region = d.get("region_name", "Region")
    crop = d.get("crop", "cotton")
    slope = float(d.get("NDVI_slope", 0))
    temp = float(d.get("temperature_mean_C", 25))
    if is_high:
        ra = f"**High Risk Alert**: {region} shows significant vegetation stress with NDVI anomaly of {anomaly * 100:.1f}%. "
        if is_drought:
            ra += "Drought conditions are confirmed via satellite data. "
        ra += "Credit recommendation: **Approve with conditions** - require crop insurance and monthly monitoring."
    else:
        ra = f"**Moderate Risk**: {region} shows acceptable vegetation health. NDVI is within normal range for {crop}. Credit recommendation: **Approve** with standard agricultural loan terms."
    ia = "- " + ("Implement deficit irrigation (reduce water by 20-30%). " if is_drought else "Maintain current irrigation schedule, monitor soil moisture weekly. ")
    ia += "- Apply foliar fertilizer (NPK 20-20-20). - Scout fields for pest pressure. "
    ia += "- Document field conditions for loan monitoring."
    so = f"Based on current NDVI trends ({'improving' if slope > 0 else 'declining'}), expect {'below-average' if is_high else 'normal'} yields. Monitor NDVI weekly."
    ro = "- Switch to drip irrigation if available. - Apply fertilizer in split doses. "
    ro += "- Use shade nets during peak heat." if temp > 30 else "- Current temperature is optimal."
    return {
        "riskAssessment": ra,
        "immediateActions": ia,
        "seasonalOutlook": so,
        "resourceOptimization": ro,
        "raw": "Mock response generated for demonstration purposes.",
    }


def _build_explain_kpi_prompt(card_id: str, metrics: dict[str, Any]) -> str:
    titles = {"portfolio": "Portfolio Value at Risk", "yield": "Yield Anomaly Forecast", "confidence": "Basis Risk / Model Confidence"}
    title = titles.get(card_id, card_id)
    loc = metrics.get("location") or "National average"
    data_lines = ""
    if card_id == "portfolio":
        data_lines = f"- Value at Risk: {metrics.get('valueAtRisk') or '—'}\n- Risk Score: {(metrics.get('riskScore') or 0) * 100:.0f}%"
    elif card_id == "yield":
        data_lines = f"- Yield Anomaly: {metrics.get('yieldAnomaly') or '—'} (vs 5-year average)"
    elif card_id == "confidence":
        p10 = metrics.get("p10")
        p50 = metrics.get("p50")
        p90 = metrics.get("p90")
        sp = metrics.get("spread")
        cl = metrics.get("confidenceLabel") or ""
        p10s = f"{p10:.2f}%" if p10 is not None else "—"
        p50s = f"{p50:.2f}%" if p50 is not None else "—"
        p90s = f"{p90:.2f}%" if p90 is not None else "—"
        sps = f"{sp:.2f}%" if sp is not None else "—"
        data_lines = f"- P10: {p10s}, P50: {p50s}, P90: {p90s}\n- Spread: {sps}\n- {cl}"
    lang = (metrics.get("language") or "en").lower()[:2]
    lang_instr = _lang_instruction(lang)
    return f"""Ты — советник банкира по агрокредитным рискам (AgroAtlas). {lang_instr}

КАРТОЧКА: "{title}"
ЛОКАЦИЯ: {loc}
ДАННЫЕ НА КАРТОЧКЕ:
{data_lines}

ЗАДАЧА: Ровно два тезиса, каждый — максимум 2 предложения.
• Тезис 1: Что это за KPI — что измеряет и зачем нужно банкиру при решении о кредите.
• Тезис 2: Что значат значения — какие числа плохо, какие хорошо, что они означают для риска.

Без списков, без заголовков. Два коротких абзаца (тезис 1, тезис 2)."""


def _mock_explain_kpi(card_id: str, _metrics: dict[str, Any]) -> str:
    if card_id == "portfolio":
        return "Это KPI оценивает потенциальные потери по кредитному портфелю в выбранном регионе; считается по модели квантильной регрессии (LightGBM) и риску урожая.\n\nВысокое значение VaR и риск-скоринга — плохо: больше экспозиции под угрозой. Низкие — хорошо: портфель в зоне риска меньше."
    if card_id == "yield":
        return "Это медианный прогноз отклонения урожая от 5-летней средней (p50 модели); нужен банкиру для оценки риска недобора и просрочки.\n\nОтрицательные значения — плохо (риск недобора). Положительные или около нуля — хорошо (урожай в норме или выше)."
    if card_id == "confidence":
        return "Это разброс прогноза: p10 (пессимизм), p50 (медиана), p90 (оптимизм) и спред; показывает уверенность модели для кредитного решения.\n\nБольшой спред — плохо (высокая неопределённость, стоит ужесточить условия). Маленький спред — хорошо (модель уверена)."
    return "Два тезиса: что за KPI и что значат значения (плохо/хорошо)."


def _pick_year(subset: pd.DataFrame, requested_year: int) -> Optional[int]:
    if "year" not in subset.columns or subset.empty:
        return None
    years = subset["year"].dropna().unique()
    if len(years) == 0:
        return None
    years = np.array(sorted([int(y) for y in years]))
    return int(years[np.argmin(np.abs(years - requested_year))])


def _chart_subset(country: str, crop: str, area_name: Optional[str], scope: str) -> pd.DataFrame:
    """Filter df by country, crop, optional area (no year filter) for chart data."""
    subset = df.copy()
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if area_name:
        area_norm = _normalize_name(area_name)
        if scope == "district" and "region_name" in subset.columns:
            names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
            mask = names == area_norm
            if mask.any():
                subset = subset[mask]
        elif scope == "region":
            districts = _load_region_districts(area_name)
            if districts and "region_name" in subset.columns:
                district_norms = {_normalize_name(d) for d in districts}
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names.isin(district_norms)
                if mask.any():
                    subset = subset[mask]
        elif "region_id" in subset.columns:
            mask = _safe_contains(subset["region_id"], area_name)
            if mask.any():
                subset = subset[mask]
    if subset.empty:
        subset = df.copy()
        if "country_iso" in subset.columns:
            subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
        if "crop" in subset.columns:
            subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    return subset


def _get_chart_data(country: str, crop: str, area_name: Optional[str], scope: str) -> dict[str, Any]:
    """Build ndviAnomalyTimeline, riskDistribution, precipVsVegetation from dataset."""
    subset = _chart_subset(country, crop, area_name, scope)
    if subset.empty:
        return {
            "ndviAnomalyTimeline": [],
            "riskDistribution": [
                {"name": "Low Risk", "value": 33, "color": "#10B981"},
                {"name": "Moderate Risk", "value": 34, "color": "#f59e0b"},
                {"name": "High Risk", "value": 33, "color": "#ef4444"},
            ],
            "precipVsVegetation": [],
        }

    ndvi_anomaly_timeline: list[dict[str, Any]] = []
    if "year" in subset.columns:
        if "yield_anomaly_pct" in subset.columns:
            by_year = subset.groupby("year", as_index=False)["yield_anomaly_pct"].mean().reset_index()
            by_year = by_year.rename(columns={"yield_anomaly_pct": "anomaly"})
        elif "NDVI_anomaly" in subset.columns:
            by_year = subset.groupby("year", as_index=False)["NDVI_anomaly"].mean().reset_index()
            by_year["anomaly"] = (by_year["NDVI_anomaly"] * 100).round(1)
            by_year = by_year[["year", "anomaly"]]
        else:
            by_year = pd.DataFrame(columns=["year", "anomaly"])
        for _, row in by_year.sort_values("year").iterrows():
            ndvi_anomaly_timeline.append({"year": int(row["year"]), "anomaly": round(float(row["anomaly"]), 1), "baseline": 0})

    risk_distribution: list[dict[str, Any]] = []
    if "risk_category" in subset.columns:
        counts = subset["risk_category"].fillna("").astype(str).str.strip()
        low = int((counts.str.lower() == "low").sum())
        high = int(counts.str.lower().isin(["high", "moderate_high"]).sum())
        moderate = int(len(subset) - low - high)
        if low + moderate + high == 0:
            low, moderate, high = 33, 34, 33
        total = low + moderate + high
        risk_distribution = [
            {"name": "Low Risk", "value": round(100 * low / total) if total else 33, "color": "#10B981"},
            {"name": "Moderate Risk", "value": round(100 * moderate / total) if total else 34, "color": "#f59e0b"},
            {"name": "High Risk", "value": round(100 * high / total) if total else 33, "color": "#ef4444"},
        ]

    precip_veg: list[dict[str, Any]] = []
    if "year" in subset.columns and "precipitation_total_mm" in subset.columns and "NDVI" in subset.columns:
        by_year = subset.groupby("year", as_index=False).agg(
            precipitation=("precipitation_total_mm", "mean"),
            ndvi=("NDVI", "mean"),
        )
        for _, row in by_year.sort_values("year").iterrows():
            precip_veg.append({
                "year": int(row["year"]),
                "precipitation": round(float(row["precipitation"]), 0),
                "ndvi": round(float(row["ndvi"]), 2),
            })

    return {
        "ndviAnomalyTimeline": ndvi_anomaly_timeline,
        "riskDistribution": risk_distribution,
        "precipVsVegetation": precip_veg,
    }


def _compute_features(country: str, year: int, crop: str, area_name: Optional[str], scope: str) -> dict[str, Any]:
    subset = df.copy()
    if "country_iso" in subset.columns:
        subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
    if "year" in subset.columns:
        pass
    if "crop" in subset.columns:
        subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
    if area_name:
        matched = False
        area_norm = _normalize_name(area_name)
        if scope == "district":
            if "region_name" in subset.columns:
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names == area_norm
                if mask.any():
                    subset = subset[mask]
                    matched = True
        if scope == "region":
            districts = _load_region_districts(area_name)
            if districts and "region_name" in subset.columns:
                district_norms = {_normalize_name(d) for d in districts}
                names = subset["region_name"].fillna("").astype(str).map(_normalize_name)
                mask = names.isin(district_norms)
                if mask.any():
                    subset = subset[mask]
                    matched = True
        if not matched and "region_id" in subset.columns:
            mask = _safe_contains(subset["region_id"], area_name)
            if mask.any():
                subset = subset[mask]

    if subset.empty:
        subset = df.copy()
        if "country_iso" in subset.columns:
            subset = subset[subset["country_iso"].astype(str).str.upper() == country.upper()]
        if "crop" in subset.columns:
            subset = subset[subset["crop"].astype(str).str.lower() == crop.lower()]
        if "year" in subset.columns and not subset.empty:
            nearest_year = _pick_year(subset, year)
            if nearest_year is not None:
                subset = subset[subset["year"] == nearest_year]

    if "year" in subset.columns and not subset.empty:
        nearest_year = _pick_year(subset, year)
        if nearest_year is not None:
            subset = subset[subset["year"] == nearest_year]

    if subset.empty:
        subset = df.copy()

    available_cols = [c for c in scorer.feature_cols if c in subset.columns]
    means = subset[available_cols].mean(numeric_only=True).to_dict() if available_cols else {}
    feature_row = {c: means.get(c, np.nan) for c in scorer.feature_cols}
    region_id = None
    if "region_id" in subset.columns:
        region_id = subset["region_id"].dropna().astype(str).iloc[0] if not subset["region_id"].dropna().empty else None

    return {
        "region_id": region_id or f"{country.upper()}_UNKNOWN",
        "year": int(year),
        "crop": crop.lower(),
        "features": feature_row,
    }


class PredictRequest(BaseModel):
    region_id: str
    year: int
    crop: str
    features: dict[str, float]


class RegionDataRequest(BaseModel):
    """Request body for POST /dashboard/recommend (region data for agro recommendation)."""
    region_name: str
    country: Optional[str] = "Uzbekistan"
    crop: Optional[str] = "cotton"
    year: Optional[int] = None
    risk_category: Optional[str] = "Moderate"
    NDVI: Optional[float] = 0.5
    NDVI_anomaly: Optional[float] = 0.0
    NDVI_slope: Optional[float] = 0.0
    precipitation_total_mm: Optional[float] = 300.0
    precipitation_anomaly_mm: Optional[float] = 0.0
    temperature_mean_C: Optional[float] = 25.0
    drought_proxy: Optional[int] = 0
    heat_stress_days_proxy: Optional[int] = 0
    elevation: Optional[float] = 400.0
    slope: Optional[float] = 2.0
    predictedYield: Optional[float] = None
    yieldAnomaly: Optional[float] = None
    htcIndex: Optional[float] = None
    dscr: Optional[float] = None
    loanAmount: Optional[float] = None
    language: Optional[str] = "en"


class ExplainKpiRequest(BaseModel):
    """Request body for POST /dashboard/explain-kpi."""
    cardId: Literal["portfolio", "yield", "confidence"]
    language: Optional[str] = "en"
    location: Optional[str] = None
    valueAtRisk: Optional[str] = None
    riskScore: Optional[float] = None
    yieldAnomaly: Optional[str] = None
    p10: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    spread: Optional[float] = None
    confidenceLabel: Optional[str] = None


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "AgroAtlas Dashboard API",
        "docs": "/docs",
        "health": "/health",
        "metrics": "/dashboard/metrics",
        "recommend": "/dashboard/recommend",
        "explain-kpi": "/dashboard/explain-kpi",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/dashboard/chart-data")
def dashboard_chart_data(
    country: str = Query("UZB"),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
) -> dict[str, Any]:
    """Return chart series from dataset: NDVI anomaly timeline, risk distribution, precip vs vegetation."""
    try:
        return _get_chart_data(
            country=country,
            crop=crop,
            area_name=area_name if scope != "country" else None,
            scope=scope,
        )
    except Exception as exc:
        print(f"[dashboard/chart-data] error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/dashboard/metrics")
def dashboard_metrics(
    country: str = Query("UZB"),
    year: int = Query(2024),
    crop: str = Query("wheat"),
    scope: str = Query("country"),
    area_name: Optional[str] = Query(None),
    lang: Optional[str] = Query("en"),
) -> dict[str, Any]:
    try:
        payload = _compute_features(country, year, crop, area_name if scope != "country" else None, scope)
        result = scorer.predict_single(
            region_id=payload["region_id"],
            year=payload["year"],
            crop=payload["crop"],
            features=payload["features"],
        )
        p10 = float(result["p10"])
        p50 = float(result["p50"])
        p90 = float(result["p90"])
        spread = float(result["spread"])
        risk_category = str(result["risk_category"])
        risk_score = _risk_score_from_category(risk_category)

        base_exposure = 10_000_000
        loss_fraction = max(0.05, min(0.35, abs(p10) / 100))
        value_at_risk = f"${base_exposure * loss_fraction / 1_000_000:.1f}M"

        ai_tips: list[str] = _get_gemini_tips(
            country=country,
            year=year,
            crop=crop,
            risk_score=risk_score,
            p50=p50,
            p10=p10,
            p90=p90,
            spread=spread,
            risk_category=risk_category,
            lang=lang or "en",
        )

        return {
            "riskScore": risk_score,
            "valueAtRisk": value_at_risk,
            "yieldAnomaly": f"{p50:.1f}%",
            "p10": p10,
            "p50": p50,
            "p90": p90,
            "spread": spread,
            "confidenceLabel": _confidence_label(spread),
            "riskCategory": risk_category,
            "aiTips": ai_tips,
        }
    except Exception as exc:
        print(f"[dashboard/metrics] error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/dashboard/predict")
def dashboard_predict(req: PredictRequest) -> dict[str, Any]:
    result = scorer.predict_single(
        region_id=req.region_id,
        year=req.year,
        crop=req.crop,
        features=req.features,
    )
    p10 = float(result["p10"])
    p50 = float(result["p50"])
    p90 = float(result["p90"])
    spread = float(result["spread"])
    risk_category = str(result["risk_category"])
    return {
        "p10": p10,
        "p50": p50,
        "p90": p90,
        "spread": spread,
        "riskCategory": risk_category,
        "riskScore": _risk_score_from_category(risk_category),
        "confidenceLabel": _confidence_label(spread),
    }


@app.post("/dashboard/recommend")
def dashboard_recommend(req: RegionDataRequest) -> dict[str, str]:
    """Agro recommendation from Gemini (or mock). All Gemini logic is in backend."""
    d = req.model_dump()
    if req.year is None:
        from datetime import datetime
        d["year"] = datetime.now().year
    prompt = _build_recommend_prompt(d)
    text = _call_gemini(prompt, temperature=0.7, max_output_tokens=2048)
    if text and text.strip():
        try:
            return _parse_recommend_response(text)
        except Exception as e:
            print("[dashboard/recommend] parse error:", e)
    return _mock_recommend(d)


@app.post("/dashboard/explain-kpi")
def dashboard_explain_kpi(req: ExplainKpiRequest) -> dict[str, Any]:
    """KPI explanation from Gemini (or mock). All Gemini logic is in backend."""
    card_id = req.cardId
    metrics = {
        "language": req.language,
        "location": req.location,
        "valueAtRisk": req.valueAtRisk,
        "riskScore": req.riskScore,
        "yieldAnomaly": req.yieldAnomaly,
        "p10": req.p10,
        "p50": req.p50,
        "p90": req.p90,
        "spread": req.spread,
        "confidenceLabel": req.confidenceLabel,
    }
    prompt = _build_explain_kpi_prompt(card_id, metrics)
    text = _call_gemini(prompt, temperature=0.4, max_output_tokens=4096)
    if text and text.strip():
        return {"explanation": text.strip(), "isMock": False}
    return {"explanation": _mock_explain_kpi(card_id, metrics), "isMock": True}
