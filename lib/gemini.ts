// Gemini AI Integration for AgroAtlas
// API Documentation: https://ai.google.dev/gemini-api

const GEMINI_API_KEY = "AIzaSyD6DHUHx4VdBESh8xdfMwybda58b2eAV_0";

// Use gemini-2.0-flash (latest) or fallback options
const GEMINI_MODELS = [
  'gemini-2.5-flash',           // Latest model (2025+)
  'gemini-1.5-flash-latest',    // Fallback
  'gemini-pro',                 // Legacy fallback
];

const getGeminiUrl = (model: string) => 
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export interface RegionData {
  region_name: string
  country: string
  crop: string
  year: number
  risk_category: 'Low' | 'Moderate' | 'High'
  NDVI: number
  NDVI_anomaly: number
  NDVI_slope: number
  precipitation_total_mm: number
  precipitation_anomaly_mm: number
  temperature_mean_C: number
  drought_proxy: 0 | 1
  heat_stress_days_proxy: number
  elevation: number
  slope: number
  // Additional fields
  predictedYield?: number
  yieldAnomaly?: number
  htcIndex?: number
  dscr?: number
  loanAmount?: number
}

export interface GeminiResponse {
  riskAssessment: string
  immediateActions: string
  seasonalOutlook: string
  resourceOptimization: string
  raw: string
}

export async function getAgroRecommendation(regionData: RegionData): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const prompt = buildPrompt(regionData);
  const requestBody = JSON.stringify({
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ]
  });

  // Try each model until one works
  let lastError: Error | null = null;
  
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(`${getGeminiUrl(model)}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          console.log(`Gemini API success with model: ${model}`);
          const text = data.candidates[0].content.parts[0].text;
          return parseResponse(text);
        }
      } else if (response.status !== 404) {
        // If it's not a "model not found" error, throw immediately
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }
      
      // Model not found (404), try next model
      console.log(`Model ${model} not available, trying next...`);
      
    } catch (err) {
      lastError = err as Error;
      // Continue to next model if this one failed with 404
      if (!lastError.message.includes('404')) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

function buildPrompt(data: RegionData): string {
  const ndviStatus = data.NDVI < 0.3 ? 'Critical (bare soil/stressed)' : 
                     data.NDVI < 0.5 ? 'Low (sparse vegetation)' :
                     data.NDVI < 0.7 ? 'Moderate (healthy vegetation)' : 'High (dense vegetation)';
  
  const droughtWarning = data.drought_proxy === 1 ? '⚠️ DROUGHT CONDITIONS DETECTED' : 'No drought';
  const anomalyStatus = data.NDVI_anomaly < -0.1 ? '🔴 SEVERE NEGATIVE' :
                        data.NDVI_anomaly < -0.05 ? '🟠 Moderate negative' :
                        data.NDVI_anomaly > 0.05 ? '🟢 Positive' : '⚪ Normal';

  return `You are an expert agricultural advisor for Central Asia specializing in credit risk assessment for agricultural loans. Analyze the following satellite-derived data and provide actionable recommendations for a bank credit officer evaluating this loan.

## REGION DATA
- Region: ${data.region_name}, ${data.country}
- Crop: ${data.crop}
- Year: ${data.year}
- Risk Level: ${data.risk_category}
${data.loanAmount ? `- Loan Amount: $${data.loanAmount.toLocaleString()}` : ''}
${data.dscr ? `- DSCR (Debt Service Coverage): ${data.dscr.toFixed(2)}x` : ''}

## SATELLITE INDICATORS
- NDVI (vegetation health): ${data.NDVI.toFixed(3)} - ${ndviStatus}
- NDVI Anomaly: ${(data.NDVI_anomaly * 100).toFixed(1)}% from baseline - ${anomalyStatus}
- NDVI Trend: ${data.NDVI_slope > 0 ? '📈 Improving' : '📉 Declining'} (slope: ${data.NDVI_slope.toFixed(4)})
- Precipitation: ${data.precipitation_total_mm.toFixed(0)} mm (season total)
- Precipitation Anomaly: ${data.precipitation_anomaly_mm > 0 ? '+' : ''}${data.precipitation_anomaly_mm.toFixed(0)} mm from normal
- Temperature: ${data.temperature_mean_C.toFixed(1)}°C average
- Drought Status: ${droughtWarning}
- Heat Stress Days: ${data.heat_stress_days_proxy}
${data.htcIndex ? `- HTC Index: ${data.htcIndex.toFixed(2)} (< 0.7 indicates drought stress)` : ''}

## TERRAIN
- Elevation: ${data.elevation}m
- Slope: ${data.slope.toFixed(1)}°

## YIELD FORECAST
${data.predictedYield ? `- Predicted Yield: ${data.predictedYield.toFixed(1)} t/ha` : ''}
${data.yieldAnomaly ? `- Yield Anomaly: ${data.yieldAnomaly > 0 ? '+' : ''}${data.yieldAnomaly.toFixed(1)}% vs 5-year average` : ''}

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

FORMAT: Use markdown with headers. Be concise but actionable. Prioritize practical advice over theory. Use Central Asian agricultural context for ${data.crop} cultivation.

CRITICAL RULES:
- If drought_proxy = 1: PRIORITIZE water conservation and drought mitigation
- If NDVI_anomaly < -10%: Investigate pest/disease, recommend field inspection
- If DSCR < 1.0: Flag high default risk, recommend additional collateral
- If DSCR > 1.25: Good creditworthiness, can approve with standard terms`;
}

function parseResponse(text: string): GeminiResponse {
  // Clean up the text
  const cleanText = text.replace(/\r\n/g, '\n').trim();
  
  console.log('Raw Gemini response:', cleanText.substring(0, 500) + '...');
  
  // Try to split by numbered sections (1., 2., 3., 4.) or headers
  const sections = {
    riskAssessment: '',
    immediateActions: '',
    seasonalOutlook: '',
    resourceOptimization: '',
    raw: text
  };

  // Strategy 1: Split by numbered bold headers like **1. RISK ASSESSMENT**
  const numberedPattern = /\*\*(\d+)\.\s*([A-Z\s]+)\*\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/gi;
  let matches = [...cleanText.matchAll(numberedPattern)];
  
  if (matches.length >= 3) {
    for (const match of matches) {
      const headerName = match[2].trim().toUpperCase();
      const content = match[3].trim();
      assignSection(sections, headerName, content);
    }
  }
  
  // Strategy 2: Split by markdown headers ## or ###
  if (!sections.riskAssessment) {
    const headerPattern = /#{1,3}\s*(?:\d+\.)?\s*([A-Z][A-Z\s]+)\s*\n([\s\S]*?)(?=#{1,3}|$)/gi;
    matches = [...cleanText.matchAll(headerPattern)];
    
    for (const match of matches) {
      const headerName = match[1].trim().toUpperCase();
      const content = match[2].trim();
      assignSection(sections, headerName, content);
    }
  }
  
  // Strategy 3: Split by bold headers **HEADER**
  if (!sections.riskAssessment) {
    const boldPattern = /\*\*([A-Z][A-Z\s]+)\*\*[:\s]*([\s\S]*?)(?=\*\*[A-Z]|$)/gi;
    matches = [...cleanText.matchAll(boldPattern)];
    
    for (const match of matches) {
      const headerName = match[1].trim().toUpperCase();
      const content = match[2].trim();
      assignSection(sections, headerName, content);
    }
  }

  // Strategy 4: If still empty, try to split text into 4 parts roughly
  if (!sections.riskAssessment && !sections.immediateActions) {
    const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim().length > 20);
    if (paragraphs.length >= 4) {
      sections.riskAssessment = paragraphs[0];
      sections.immediateActions = paragraphs.slice(1, Math.ceil(paragraphs.length / 2)).join('\n\n');
      sections.seasonalOutlook = paragraphs[Math.ceil(paragraphs.length / 2)];
      sections.resourceOptimization = paragraphs.slice(-1).join('\n\n');
    } else if (paragraphs.length >= 1) {
      // Just put everything in risk assessment as fallback
      sections.riskAssessment = paragraphs.join('\n\n');
    }
  }

  console.log('Parsed sections:', {
    riskAssessment: sections.riskAssessment?.length || 0,
    immediateActions: sections.immediateActions?.length || 0,
    seasonalOutlook: sections.seasonalOutlook?.length || 0,
    resourceOptimization: sections.resourceOptimization?.length || 0,
  });

  return sections;
}

function assignSection(sections: GeminiResponse, headerName: string, content: string): void {
  if (!content || content.length < 10) return;
  
  if (headerName.includes('RISK') && headerName.includes('ASSESS')) {
    sections.riskAssessment = content;
  } else if (headerName.includes('IMMEDIATE') || headerName.includes('ACTION')) {
    sections.immediateActions = content;
  } else if (headerName.includes('SEASON') || headerName.includes('OUTLOOK')) {
    sections.seasonalOutlook = content;
  } else if (headerName.includes('RESOURCE') || headerName.includes('OPTIM')) {
    sections.resourceOptimization = content;
  }
}

/** KPI card IDs for dashboard explain modal */
export type KpiCardId = 'portfolio' | 'yield' | 'confidence';

export interface KpiExplainMetrics {
  location?: string
  valueAtRisk?: string
  riskScore?: number
  yieldAnomaly?: string
  p10?: number
  p50?: number
  p90?: number
  spread?: number
  confidenceLabel?: string
}

const KPI_CARD_DESCRIPTIONS: Record<KpiCardId, string> = {
  portfolio: 'Portfolio Value at Risk',
  yield: 'Yield Anomaly Forecast',
  confidence: 'Basis Risk / Model Confidence',
};

/** Call Gemini 2.5 Flash for short banker-facing explanation of a KPI card and its ML data */
export async function getKpiExplanation(cardId: KpiCardId, metrics: KpiExplainMetrics): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    return getMockKpiExplanation(cardId, metrics);
  }

  const cardTitle = KPI_CARD_DESCRIPTIONS[cardId];
  const prompt = `You are an expert explaining agricultural risk metrics to bank credit officers (AgroAtlas product). Audience: bankers.

CARD: "${cardTitle}"
LOCATION: ${metrics.location ?? 'National average'}
CURRENT DATA:
${cardId === 'portfolio' ? `- Value at Risk: ${metrics.valueAtRisk ?? '—'}\n- Risk Score: ${metrics.riskScore != null ? (metrics.riskScore * 100).toFixed(0) + '%' : '—'}` : ''}
${cardId === 'yield' ? `- Yield Anomaly: ${metrics.yieldAnomaly ?? '—'} (vs 5-year average)` : ''}
${cardId === 'confidence' ? `- P10: ${metrics.p10?.toFixed(2) ?? '—'}%, P50: ${metrics.p50?.toFixed(2) ?? '—'}%, P90: ${metrics.p90?.toFixed(2) ?? '—'}%\n- Spread: ${metrics.spread?.toFixed(2) ?? '—'}%\n- ${metrics.confidenceLabel ?? ''}` : ''}

TASK: In 3–5 short sentences (max 200 words), in Russian:
1) What this card means for a banker (why it matters for credit decisions).
2) Brief explain of how the number is obtained from the ML model / data.

Tone: professional, concise. No bullet lists. Plain paragraphs.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 400,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  });

  for (const model of GEMINI_MODELS) {
    try {
      const url = `${getGeminiUrl(model)}?key=${apiKey}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        if (res.status === 404) continue;
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch (e) {
      if (String(e).includes('404')) continue;
      console.error('Gemini KPI explain error:', e);
      break;
    }
  }
  return getMockKpiExplanation(cardId, metrics);
}

export function getMockKpiExplanation(cardId: KpiCardId, metrics: KpiExplainMetrics): string {
  const loc = metrics.location ?? 'по стране';
  switch (cardId) {
    case 'portfolio':
      return `Карточка «Стоимость портфеля в зоне риска» показывает оценку потенциальных потерь по кредитному портфелю в выбранном регионе. Значение считается на основе модели квантильной регрессии (LightGBM): по прогнозу yield anomaly и калибровке риска (p10, σ_down) оценивается доля портфеля, которая может уйти в минус. Для банкира это индикатор, сколько экспозиции стоит хеджировать или пересмотреть.`;
    case 'yield':
      return `«Прогноз аномалии урожая» — это медианный прогноз отклонения урожайности от 5-летней средней (p50 модели). Модель обучена на спутниковых и климатических признаках (NDVI, осадки, температура и др.) и даёт процентное отклонение. Отрицательное значение сигнализирует о риске недобора урожая и возможных просрочках по кредитам.`;
    case 'confidence':
      return `«Базисный риск / уверенность модели» показывает разброс прогноза: p10 (пессимистичный сценарий), p50 (медиана), p90 (оптимистичный) и спред (p90 − p10). Чем больше спред, тем выше неопределённость — для банка это повод либо ужесточить условия, либо запросить дополнительное обеспечение.`;
    default:
      return 'Краткое объяснение по этой карточке для банкиров и источник данных из ML.';
  }
}

// Mock response for development/demo without API key
export function getMockRecommendation(regionData: RegionData): GeminiResponse {
  const isHighRisk = regionData.risk_category === 'High' || regionData.NDVI_anomaly < -0.1;
  const isDrought = regionData.drought_proxy === 1;
  
  return {
    riskAssessment: isHighRisk
      ? `**High Risk Alert**: ${regionData.region_name} shows significant vegetation stress with NDVI anomaly of ${(regionData.NDVI_anomaly * 100).toFixed(1)}%. ${isDrought ? 'Drought conditions are confirmed via satellite data.' : ''} Credit recommendation: **Approve with conditions** - require crop insurance and monthly monitoring.`
      : `**Moderate Risk**: ${regionData.region_name} shows acceptable vegetation health. NDVI is within normal range for ${regionData.crop} at this growth stage. Credit recommendation: **Approve** with standard agricultural loan terms.`,
    
    immediateActions: `- ${isDrought ? '🚨 **Urgent**: Implement deficit irrigation (reduce water by 20-30%) to extend water supply' : 'Maintain current irrigation schedule, monitor soil moisture weekly'}
- Apply foliar fertilizer (NPK 20-20-20) to boost plant resilience
- Scout fields for pest pressure, especially aphids and bollworm in ${regionData.crop}
- ${isHighRisk ? 'Consider early harvest if vegetation continues declining' : 'Continue standard agronomic practices'}
- Document field conditions with photos for loan monitoring`,
    
    seasonalOutlook: `Based on current NDVI trends (${regionData.NDVI_slope > 0 ? 'improving' : 'declining'}), expect ${isHighRisk ? 'below-average' : 'normal'} yields this season. ${isDrought ? 'Water stress will likely continue for 2-3 weeks based on precipitation forecasts.' : 'Conditions should remain stable through harvest.'} Monitor NDVI weekly - if it drops below 0.35, trigger emergency consultation.`,
    
    resourceOptimization: `- Switch to drip irrigation if available (saves 30-40% water, improves yield uniformity)
- Apply fertilizer in split doses rather than single application (better uptake, less runoff)
- ${regionData.temperature_mean_C > 30 ? 'Use shade nets during peak heat hours (10am-4pm) to reduce transpiration' : 'Current temperature is optimal for crop growth'}`,
    
    raw: 'Mock response generated for demonstration purposes.'
  };
}
