"""
AI Service: логика вызовов Gemini API.
Изолированный сервис с таймаутами, fallback и безопасной обработкой ответов.
"""
from __future__ import annotations

import json
import logging
import os
import re
import ssl
import urllib.error
import urllib.request
from typing import Any, Optional

from dotenv import load_dotenv

# Только .env в папке ai_service — единственный источник для API-ключа
_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_SERVICE_DIR, ".env"))

logger = logging.getLogger(__name__)

# Лимиты для безопасности и стабильности
GEMINI_TIMEOUT_TIPS = 15
GEMINI_TIMEOUT_GENERIC = 20
GEMINI_MAX_OUTPUT_TIPS = 400
GEMINI_MAX_OUTPUT_RECOMMEND = 2048
GEMINI_MAX_OUTPUT_EXPLAIN = 4096
# Модель Gemini (404 = неверный ID; 429 = квота). Переопределить через GEMINI_MODEL в .env.
# Актуальные: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash, gemini-3-flash-preview
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_MAX_OUTPUT_STRUCTURED = 2048
GEMINI_TIMEOUT_STRUCTURED = 20


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


def _call_gemini(
    prompt: str,
    temperature: float = 0.7,
    max_output_tokens: int = 1024,
    timeout: int = GEMINI_TIMEOUT_GENERIC,
) -> Optional[str]:
    """
    Вызов Gemini API. Возвращает текст ответа или None при ошибке/квоте.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_output_tokens},
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            logger.warning("Gemini 429 (quota), using fallback")
        elif e.code == 404:
            logger.warning(
                "Gemini 404 (model not found). Set GEMINI_MODEL in ai_service/.env to a valid model, e.g. gemini-2.5-flash or gemini-2.0-flash."
            )
        elif e.code == 403:
            logger.warning("Gemini 403 (Forbidden). Check GEMINI_API_KEY and enable Generative Language API.")
        else:
            logger.warning("Gemini HTTP error: %s %s", e.code, getattr(e, "reason", e))
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
    При ошибке или отсутствии ключа возвращает fallback.
    """
    api_key = _get_api_key()
    if not api_key:
        return _fallback_ai_tips()

    lang_instr = _lang_instruction(lang)
    prompt = f"""Ты — советник банкира по агрокредитным рискам. Дай 3–5 коротких советов для кредитного решения. {lang_instr}

Контекст: страна {country}, год {year}, культура {crop}. Категория риска: {risk_category}, risk score: {risk_score:.2f}. Аномалия урожая: p50={p50:.1f}%, p10={p10:.1f}%, p90={p90:.1f}%, спред={spread:.1f}.

Формат: только список советов, по одному на строку, без нумерации и заголовков. Короткие фразы."""

    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": GEMINI_MAX_OUTPUT_TIPS},
    }).encode("utf-8")

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_TIPS, context=ctx) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        if isinstance(e, urllib.error.HTTPError):
            if e.code == 429:
                logger.warning("Gemini 429 (quota), using fallback tips")
            elif e.code == 403:
                logger.warning("Gemini 403 (Forbidden). Check GEMINI_API_KEY.")
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
    return lines[:8] if lines else _fallback_ai_tips()


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
    return f"""Ты — кредитный советник по агро-рискам. Дай структурированную рекомендацию для региона {region}, культура {crop}, год {year}. {lang_instr}

Данные: NDVI={data.get('NDVI')}, осадки={data.get('precipitation_total_mm')}, температура={data.get('temperature_mean_C')}, риск={data.get('risk_category')}.

Верни 4 блока в формате:
riskAssessment: ...
immediateActions: ...
seasonalOutlook: ...
resourceOptimization: ...
Каждый блок — 2–4 предложения. Без markdown."""


def _parse_recommend_response(text: str) -> dict[str, str]:
    sections = {"riskAssessment": "", "immediateActions": "", "seasonalOutlook": "", "resourceOptimization": ""}
    current = None
    for line in text.split("\n"):
        line = line.strip()
        for key in sections:
            if line.lower().startswith(key.lower() + ":"):
                current = key
                line = line.split(":", 1)[-1].strip()
                break
        if current and line:
            sections[current] = (sections[current] + " " + line).strip()
    return sections


def _mock_recommend(data: dict[str, Any]) -> dict[str, str]:
    return {
        "riskAssessment": "Оценка риска на основе спутниковых и агрометрических данных.",
        "immediateActions": "Мониторить NDVI и аномалии осадков; при ухудшении — запросить отчёт фермера.",
        "seasonalOutlook": "Сезонный прогноз зависит от выбранного региона и культуры.",
        "resourceOptimization": "Рекомендуется диверсификация культур и страховка урожая.",
    }


def get_recommendation(data: dict[str, Any]) -> tuple[dict[str, str], bool]:
    from datetime import datetime
    if data.get("year") is None:
        data = {**data, "year": datetime.now().year}
    prompt = _build_recommend_prompt(data)
    text = _call_gemini(prompt, temperature=0.7, max_output_tokens=GEMINI_MAX_OUTPUT_RECOMMEND)
    if text and text.strip():
        try:
            return _parse_recommend_response(text), False
        except Exception as e:
            logger.warning("Recommend parse error: %s", e)
    return _mock_recommend(data), True


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


def _explain_kpi_structured_fallback(scope: dict, kpi_key: str, reason: str) -> dict[str, Any]:
    """Минимальная структура при ошибке или отсутствии ответа Gemini."""
    disclaimer = "Check GEMINI_API_KEY and GEMINI_MODEL in ai_service/.env (e.g. GEMINI_MODEL=gemini-2.5-flash)."
    return {
        "title": f"KPI: {kpi_key}",
        "subtitle": f"{scope.get('crop', '')} · {scope.get('year', '')}",
        "badges": [],
        "hero": {"headline": "Data limitation: AI explanation unavailable.", "summary": reason},
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
        return _explain_kpi_structured_fallback(scope, kpi_key, f"Config load error: {e}")

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
        return _explain_kpi_structured_fallback(scope, kpi_key, str(e)[:200])

    if text:
        parsed = parse_json(text)
        if parsed and isinstance(parsed, dict):
            logger.info("explain_kpi_structured request_id=%s parsed OK", request_id)
            return ensure_structure(parsed)

        try:
            repair_prompt = f"""The following response is not valid JSON. Fix it so it is a single valid JSON object matching the schema (title, subtitle, badges, hero, metrics, sections, table, confidence, next_actions, disclaimer). Output only the corrected JSON, nothing else.

Invalid response:
{text[:1500]}"""
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
    return _explain_kpi_structured_fallback(scope, kpi_key, "AI did not return valid JSON.")
