// Types for AI responses — вся логика вызова Gemini в бэкенде (backend/services/dashboard/app.py)

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

/** KPI card IDs for dashboard explain (backend POST /dashboard/explain-kpi) */
export type KpiCardId = 'portfolio' | 'yield' | 'confidence'

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

export interface KpiExplanationResult {
  explanation: string
  isMock: boolean
}
