"""
AI Service: логика вызовов Gemini API.
Изолированный сервис с таймаутами, fallback, кэшем и повтором при 429.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from typing import Any, Optional

from dotenv import load_dotenv

# Только .env в папке ai_service — единственный источник для API-ключа
_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_SERVICE_DIR, ".env"))

logger = logging.getLogger(__name__)

# Таймауты и лимиты вывода (без жёстких ограничений)
GEMINI_TIMEOUT_TIPS = 300
GEMINI_TIMEOUT_GENERIC = 300
GEMINI_MAX_OUTPUT_TIPS = 8192
GEMINI_MAX_OUTPUT_RECOMMEND = 8192
GEMINI_MAX_OUTPUT_EXPLAIN = 8192
# Модель Gemini (404 = неверный ID; 429 = квота). Переопределить через GEMINI_MODEL в .env.
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_MAX_OUTPUT_STRUCTURED = 8192
GEMINI_TIMEOUT_STRUCTURED = 300

# Кэш ответов Gemini (tips, recommend), чтобы не жечь квоту при повторных запросах
_CACHE_TTL_SEC = 300  # 5 минут
_gemini_cache: dict[str, tuple[Any, float]] = {}


def _cache_get(key: str):  # -> (value, True) or (None, False)
    now = time.time()
    if key in _gemini_cache:
        val, expiry = _gemini_cache[key]
        if now < expiry:
            return val, True
        del _gemini_cache[key]
    return None, False


def _cache_set(key: str, value: Any) -> None:
    _gemini_cache[key] = (value, time.time() + _CACHE_TTL_SEC)
    # Ограничить размер кэша (оставить последние ~100 записей)
    if len(_gemini_cache) > 150:
        expired = [(k, v[1]) for k, v in _gemini_cache.items()]
        expired.sort(key=lambda x: x[1])
        for k, _ in expired[:50]:
            _gemini_cache.pop(k, None)


def _get_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or "").strip()


def _lang_instruction(lang: str) -> str:
    """Инструкция для Gemini: язык ответа."""
    lang = (lang or "en").lower()[:2]
    if lang == "ru":
        return "Отвечай только на русском."
    if lang == "uz":
        return "Javobni faqat o'zbek tilida bering."
    return "Answer in English only."


def _fallback_ai_tips() -> list[str]:
    """Fallback советы при недоступности Gemini."""
    return [
        "Мониторить динамику урожайности по спутниковым данным.",
        "Учитывать спред квантилей (p10–p90) при решении о кредите.",
        "При отрицательной аномалии урожая рассмотреть страховку или резерв.",
    ]


def _parse_429_retry_seconds(err_body: str) -> float:
    """Из тела 429 вытащить «Please retry in X.XXs» и вернуть X (макс. 30 сек)."""
    match = re.search(r"retry in (\d+\.?\d*)\s*s", err_body or "", re.I)
    if not match:
        return 10.0
    try:
        sec = float(match.group(1))
        return min(max(sec, 1.0), 30.0)
    except (ValueError, TypeError):
        return 10.0


def _call_gemini(
    prompt: str,
    temperature: float = 0.7,
    max_output_tokens: int = 8192,
    timeout: int = GEMINI_TIMEOUT_GENERIC,
    _retry_on_429: bool = True,
) -> Optional[str]:
    """
    Вызов Gemini API. При 429 — один повтор после ожидания (retry in Xs из ответа).
    Возвращает текст ответа или None при ошибке/квоте.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_output_tokens},
    }).encode("utf-8")

    last_err_body = ""

    for attempt in range(2):
        try:
            req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:800]
            except Exception:
                pass
            last_err_body = err_body
            if e.code == 429 and _retry_on_429 and attempt == 0:
                wait_s = _parse_429_retry_seconds(err_body)
                logger.warning("Gemini 429 (quota). Retrying after %.1fs.", wait_s)
                time.sleep(wait_s)
                continue
            if e.code == 429:
                logger.warning("Gemini 429 (quota), using fallback")
            elif e.code == 404:
                logger.warning(
                    "Gemini 404 (model not found). Set GEMINI_MODEL in ai_service/.env to a valid model, e.g. gemini-2.5-flash or gemini-2.0-flash."
                )
            elif e.code == 403:
                logger.warning("Gemini 403 (Forbidden). Check GEMINI_API_KEY and enable Generative Language API.")
            elif e.code == 400:
                logger.warning("Gemini 400 Bad Request. Response: %s", err_body or "(no body)")
            else:
                logger.warning("Gemini HTTP error: %s %s. Response: %s", e.code, getattr(e, "reason", e), err_body or "")
            return None
        except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
            logger.warning("Gemini request error: %s", getattr(e, "reason", e))
            return None

        try:
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts") or []
            text_parts = [p.get("text", "") or "" for p in parts if isinstance(p, dict)]
            result = "".join(text_parts).strip()
            return result or None
        except (IndexError, KeyError, TypeError):
            return None

    return None


# ----- Tips -----

def get_tips(
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
    """
    Получить 3–5 коротких советов от Gemini для метрик дашборда.
    Кэш 5 мин по (country, year, crop, округлённые метрики, lang). При 429 — один повтор после паузы.
    """
    cache_key = f"tips:{country}:{year}:{crop}:{round(risk_score, 2)}:{round(p50, 1)}:{round(p10, 1)}:{round(p90, 1)}:{round(spread, 1)}:{risk_category}:{lang}"
    cached, hit = _cache_get(cache_key)
    if hit and isinstance(cached, list):
        return cached

    api_key = _get_api_key()
    if not api_key:
        logger.warning("Tips: GEMINI_API_KEY not set or empty. Using fallback.")
        return _fallback_ai_tips()

    lang_instr = _lang_instruction(lang)
    prompt = f"""Ты — советник банкира по агрокредитным рискам. Дай 3–5 коротких советов для кредитного решения. {lang_instr}

Контекст: страна {country}, год {year}, культура {crop}. Категория риска: {risk_category}, risk score: {risk_score:.2f}. Аномалия урожая: p50={p50:.1f}%, p10={p10:.1f}%, p90={p90:.1f}%, спред={spread:.1f}.

Формат: только список советов, по одному на строку, без нумерации и заголовков. Короткие фразы."""

    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": GEMINI_MAX_OUTPUT_TIPS},
    }).encode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={api_key}"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
    ctx = ssl.create_default_context()

    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_TIPS, context=ctx) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:800]
            except Exception:
                pass
            if e.code == 429 and attempt == 0:
                wait_s = _parse_429_retry_seconds(err_body)
                logger.warning("Tips: Gemini 429. Retrying after %.1fs.", wait_s)
                time.sleep(wait_s)
                continue
            logger.warning("Tips: Gemini HTTP %s. Body: %s. Using fallback.", e.code, err_body or "(none)")
            return _fallback_ai_tips()
        except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
            logger.warning("Tips: Gemini request failed: %s. Using fallback.", getattr(e, "reason", e))
            return _fallback_ai_tips()
        break
    else:
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
    result = lines[:8] if lines else _fallback_ai_tips()
    _cache_set(cache_key, result)
    return result


# ----- Recommend -----

def _build_recommend_prompt(data: dict[str, Any]) -> str:
    from datetime import datetime
    if data.get("year") is None:
        data = {**data, "year": datetime.now().year}
    region = data.get("region_name", "Region")
    crop = data.get("crop", "cotton")
    year = data.get("year")
    lang = (data.get("language") or "en").lower()[:2]
    lang_instr = _lang_instruction(lang)
    ndvi = data.get("NDVI")
    ndvi_anom = data.get("NDVI_anomaly")
    if ndvi_anom is not None and abs(ndvi_anom) <= 1 and (ndvi_anom == 0 or 0.001 < abs(ndvi_anom) < 1.5):
        ndvi_anom = (ndvi_anom * 100) if abs(ndvi_anom) <= 1.5 else ndvi_anom
    precip = data.get("precipitation_total_mm")
    temp = data.get("temperature_mean_C")
    risk = data.get("risk_category")
    yield_anom = data.get("yieldAnomaly")
    htc = data.get("htcIndex")
    dscr = data.get("dscr")
    data_line = f"NDVI={ndvi}, аномалия NDVI={ndvi_anom}%, осадки={precip} мм, температура={temp}°C, категория риска={risk}".replace("None", "—")
    if yield_anom is not None:
        data_line += f", аномалия урожая={yield_anom}%"
    if htc is not None:
        data_line += f", HTC={htc}"
    if dscr is not None:
        data_line += f", DSCR={dscr}"
    return f"""Ты — агрокредитный советник. Дай конкретную рекомендацию именно для этого поля, не общие фразы. {lang_instr}

Регион/поле: {region}. Культура: {crop}. Год: {year}.
Данные: {data_line}.

Напиши 4 блока — каждый 2–4 предложения с конкретикой (цифры, уровень риска, что делать именно здесь). Формат строго по одной строке на ключ:
riskAssessment: (оценка риска для этого поля с учётом NDVI и категории риска)
immediateActions: (конкретные действия на ближайшие недели)
seasonalOutlook: (прогноз на сезон для {crop} в {region})
resourceOptimization: (рекомендации по воде/удобрениям/страховке для этих условий)

Только эти 4 строки, без markdown и без лишнего текста."""


def _parse_recommend_response(text: str) -> dict[str, str]:
    sections = {"riskAssessment": "", "immediateActions": "", "seasonalOutlook": "", "resourceOptimization": "", "raw": ""}
    key_aliases = {
        "riskassessment": "riskAssessment",
        "risk assessment": "riskAssessment",
        "immediateactions": "immediateActions",
        "immediate actions": "immediateActions",
        "seasonaloutlook": "seasonalOutlook",
        "seasonal outlook": "seasonalOutlook",
        "resourceoptimization": "resourceOptimization",
        "resource optimization": "resourceOptimization",
    }
    current = None
    for line in text.split("\n"):
        raw_line = line
        line = line.strip().lstrip("-*• ")
        for alias, key in key_aliases.items():
            if line.lower().startswith(alias + ":"):
                current = key
                line = line.split(":", 1)[-1].strip()
                break
        if current and line:
            sections[current] = (sections[current] + " " + line).strip()
    sections["raw"] = text.strip()
    return sections


def _mock_recommend(data: dict[str, Any]) -> dict[str, str]:
    region = data.get("region_name", "регион")
    crop = data.get("crop", "культура")
    ndvi = data.get("NDVI")
    risk = data.get("risk_category") or "Moderate"
    ndvi_s = f" NDVI {ndvi:.2f}." if ndvi is not None and isinstance(ndvi, (int, float)) else ""
    return {
        "riskAssessment": f"Оценка риска для {region}, {crop}: категория {risk}.{ndvi_s} Данные — спутниковые и агрометрические; для детальной оценки подключите ИИ (Gemini).",
        "immediateActions": f"Мониторить NDVI и осадки по полю {region}; при снижении вегетации — запросить отчёт фермера и рассмотреть страховку.",
        "seasonalOutlook": f"Сезонный прогноз для {crop} в {region} зависит от текущих данных; обновление при следующем запросе с ИИ.",
        "resourceOptimization": "Рекомендуется диверсификация и страховка урожая. Для персональных рекомендаций по воде и удобрениям нужен ответ Gemini.",
        "raw": "AI recommendation temporarily unavailable (fallback). Check GEMINI_API_KEY and GEMINI_MODEL on AI service.",
    }


def get_recommendation(data: dict[str, Any]) -> tuple[dict[str, str], bool]:
    from datetime import datetime
    if data.get("year") is None:
        data = {**data, "year": datetime.now().year}
    # Кэш по округлённому контексту (5 мин), чтобы не жечь квоту при повторных запросах
    ndvi = data.get("NDVI")
    ndvi_anom = data.get("NDVI_anomaly")
    key_str = f"rec:{data.get('region_name','')}:{data.get('crop','')}:{data.get('year')}:{round(ndvi, 2) if ndvi is not None else ''}:{round(ndvi_anom, 2) if ndvi_anom is not None else ''}:{data.get('risk_category','')}:{(data.get('language') or 'en')[:2]}"
    cache_key = "rec:" + hashlib.sha256(key_str.encode()).hexdigest()[:32]
    cached, hit = _cache_get(cache_key)
    if hit and isinstance(cached, (list, tuple)) and len(cached) == 2:
        return cached[0], cached[1]

    prompt = _build_recommend_prompt(data)
    text = _call_gemini(prompt, temperature=0.5, max_output_tokens=GEMINI_MAX_OUTPUT_RECOMMEND)
    if text and text.strip():
        try:
            parsed = _parse_recommend_response(text)
            if any(parsed.get(k) for k in ("riskAssessment", "immediateActions", "seasonalOutlook", "resourceOptimization")):
                _cache_set(cache_key, (parsed, False))
                return parsed, False
            logger.warning("Recommend: Gemini returned text but no sections parsed. Fallback to mock.")
        except Exception as e:
            logger.warning("Recommend parse error: %s", e)
    else:
        logger.warning("Recommend: no Gemini response (check API key, model, quota). Using fallback.")
    out = _mock_recommend(data), True
    _cache_set(cache_key, out)  # кэшируем и fallback, чтобы не дёргать API при повторе
    return out[0], out[1]


# ----- Explain KPI (legacy, plain text) -----

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
        p10, p50, p90 = metrics.get("p10"), metrics.get("p50"), metrics.get("p90")
        sp, cl = metrics.get("spread"), metrics.get("confidenceLabel") or ""
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


def explain_kpi(card_id: str, metrics: dict[str, Any]) -> tuple[str, bool]:
    """
    Объяснение KPI карточки (Gemini или mock).
    Возвращает (explanation, is_mock).
    """
    prompt = _build_explain_kpi_prompt(card_id, metrics)
    text = _call_gemini(prompt, temperature=0.4, max_output_tokens=GEMINI_MAX_OUTPUT_EXPLAIN)
    if text and text.strip():
        return text.strip(), False
    return _mock_explain_kpi(card_id, metrics), True


# ----- Structured KPI explain (JSON-only response) -----

def _strip_json_raw(text: str) -> str:
    """Remove markdown code fences if present."""
    s = text.strip()
    if s.startswith("```"):
        lines = s.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        s = "\n".join(lines)
    return s.strip()


def _build_structured_user_prompt(scope: dict, kpi_key: str, kpi_values: dict, meta: dict) -> str:
    parts = [
        "SCOPE:",
        f"  country={scope.get('country')} region_level={scope.get('region_level')} region_id={scope.get('region_id')} crop={scope.get('crop')} year={scope.get('year')}",
        "",
        f"KPI: {kpi_key}",
        "",
        "CURRENT KPI VALUES (as shown on the card):",
        json.dumps(kpi_values, ensure_ascii=False, indent=2),
    ]
    if meta:
        parts.extend(["", "META:", json.dumps(meta, ensure_ascii=False)])
    parts.extend(["", "Output ONLY the JSON object, no other text."])
    return "\n".join(parts)


def _kpi_key_to_card_id(kpi_key: str) -> str:
    """Маппинг kpi_key (structured) -> card_id (legacy explain_kpi)."""
    if kpi_key in ("yield_anomaly", "downside_risk", "vegetation_health", "season_stress"):
        return "yield"
    if kpi_key in ("high_risk_share", "dscr"):
        return "portfolio"
    return "yield"


def _build_legacy_metrics_from_structured(scope: dict, kpi_values: dict) -> dict[str, Any]:
    """Собрать metrics для explain_kpi из scope и kpi_values."""
    loc = (scope.get("region_id") or scope.get("country") or "National average") or "National average"
    metrics: dict[str, Any] = {
        "language": "en",
        "location": loc,
        "valueAtRisk": kpi_values.get("value_at_risk") or kpi_values.get("value"),
        "riskScore": kpi_values.get("risk_score") or kpi_values.get("value"),
        "yieldAnomaly": kpi_values.get("yield_anomaly") or kpi_values.get("value"),
        "p10": kpi_values.get("p10"),
        "p50": kpi_values.get("p50"),
        "p90": kpi_values.get("p90"),
        "spread": kpi_values.get("spread"),
        "confidenceLabel": kpi_values.get("confidence_label") or "",
    }
    return metrics


def _explain_kpi_structured_fallback(
    scope: dict, kpi_key: str, reason: str, kpi_values: Optional[dict] = None
) -> dict[str, Any]:
    """Минимальная структура при ошибке или отсутствии ответа Gemini. При возможности подставляем текст из legacy explain_kpi."""
    disclaimer = "Check GEMINI_API_KEY and GEMINI_MODEL in ai_service/.env (e.g. GEMINI_MODEL=gemini-2.5-flash)."
    summary = reason
    headline = "Data limitation: AI explanation unavailable."
    if kpi_values is not None:
        try:
            card_id = _kpi_key_to_card_id(kpi_key)
            metrics = _build_legacy_metrics_from_structured(scope, kpi_values)
            text, is_mock = explain_kpi(card_id, metrics)
            if text and text.strip():
                summary = text.strip()
                headline = "Explanation (fallback from text model)" if is_mock else "Explanation"
        except Exception as e:
            logger.debug("explain_kpi fallback failed: %s", e)
    return {
        "title": f"KPI: {kpi_key}",
        "subtitle": f"{scope.get('crop', '')} · {scope.get('year', '')}",
        "badges": [],
        "hero": {"headline": headline, "summary": summary},
        "metrics": [],
        "sections": [],
        "table": None,
        "confidence": {"level": "low", "reason": "Fallback", "limitations": [reason]},
        "next_actions": [],
        "disclaimer": disclaimer,
    }


def explain_kpi_structured(
    kpi_group: str,
    kpi_key: str,
    scope: dict,
    kpi_values: dict,
    meta: Optional[dict] = None,
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Structured KPI explanation: Gemini returns strict JSON for UI.
    One repair pass if JSON invalid. Fallback to minimal valid structure if still failing.
    Never raises — always returns a valid dict.
    """
    try:
        from prompts_kpi import (
            JSON_SCHEMA_INSTRUCTION,
            SYSTEM_PROMPT_FINANCE,
            SYSTEM_PROMPT_SATELLITE,
        )
    except Exception as e:
        logger.warning("explain_kpi_structured prompts_kpi import failed: %s", e)
        return _explain_kpi_structured_fallback(scope, kpi_key, f"Config load error: {e}", kpi_values)

    meta = meta or {}
    system = SYSTEM_PROMPT_FINANCE if kpi_group == "finance" else SYSTEM_PROMPT_SATELLITE
    user_content = _build_structured_user_prompt(scope, kpi_key, kpi_values, meta)
    full_prompt = f"{system}\n{JSON_SCHEMA_INSTRUCTION}\n\n---\n\n{user_content}"

    def parse_json(raw: str) -> Optional[dict]:
        raw = _strip_json_raw(raw)
        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return None

    def ensure_structure(obj: dict) -> dict:
        defaults: dict[str, Any] = {
            "title": obj.get("title") or "",
            "subtitle": obj.get("subtitle") or "",
            "badges": obj.get("badges") if isinstance(obj.get("badges"), list) else [],
            "hero": obj.get("hero"),
            "metrics": obj.get("metrics") if isinstance(obj.get("metrics"), list) else [],
            "sections": obj.get("sections") if isinstance(obj.get("sections"), list) else [],
            "table": obj.get("table"),
            "confidence": obj.get("confidence"),
            "next_actions": obj.get("next_actions") if isinstance(obj.get("next_actions"), list) else [],
            "disclaimer": obj.get("disclaimer") or "",
        }
        return {k: defaults.get(k) for k in defaults}

    try:
        text = _call_gemini(
            full_prompt,
            temperature=0.3,
            max_output_tokens=GEMINI_MAX_OUTPUT_STRUCTURED,
            timeout=GEMINI_TIMEOUT_STRUCTURED,
        )
    except Exception as e:
        logger.warning("explain_kpi_structured request_id=%s _call_gemini error: %s", request_id, e)
        return _explain_kpi_structured_fallback(scope, kpi_key, str(e)[:200], kpi_values)

    if text:
        parsed = parse_json(text)
        if parsed and isinstance(parsed, dict):
            logger.info("explain_kpi_structured request_id=%s parsed OK", request_id)
            return ensure_structure(parsed)

        try:
            repair_prompt = f"""The following response is not valid JSON. Fix it so it is a single valid JSON object matching the schema (title, subtitle, badges, hero, metrics, sections, table, confidence, next_actions, disclaimer). Output only the corrected JSON, nothing else.

Invalid response:
{text[:10000]}"""
            repair_text = _call_gemini(
                repair_prompt,
                temperature=0.2,
                max_output_tokens=GEMINI_MAX_OUTPUT_STRUCTURED,
                timeout=GEMINI_TIMEOUT_STRUCTURED,
            )
            if repair_text:
                repaired = parse_json(repair_text)
                if repaired and isinstance(repaired, dict):
                    logger.info("explain_kpi_structured request_id=%s repaired OK", request_id)
                    return ensure_structure(repaired)
        except Exception as e:
            logger.warning("explain_kpi_structured request_id=%s repair error: %s", request_id, e)

    logger.warning("explain_kpi_structured request_id=%s using fallback", request_id)
    return _explain_kpi_structured_fallback(scope, kpi_key, "AI did not return valid JSON.", kpi_values)
