/**
 * Types for structured KPI explain (POST /dashboard/kpi-explain → JSON UI).
 */

export type KpiExplainGroup = 'finance' | 'satellite'
export type KpiExplainKey =
  | 'yield_anomaly'
  | 'downside_risk'
  | 'high_risk_share'
  | 'dscr'
  | 'vegetation_health'
  | 'season_stress'

export interface KpiExplainScope {
  country: string
  region_level: 'country' | 'oblast' | 'district'
  region_id: string | null
  crop: string
  year: number
}

export interface KpiExplainMeta {
  rows_used?: number
  year_used?: number
  fallback?: 'none' | 'oblast' | 'country'
  data_confidence?: 'high' | 'low'
}

export interface KpiExplainRequestPayload {
  kpi_group: KpiExplainGroup
  kpi_key: KpiExplainKey
  scope: KpiExplainScope
  kpi_values: Record<string, unknown>
  meta?: KpiExplainMeta
}

/** Response schema from AI (strict JSON). */
export type BadgeTone = 'neutral' | 'good' | 'warning' | 'danger'
export type PriorityLevel = 'P0' | 'P1' | 'P2'

export interface KpiExplainBadge {
  label: string
  tone: BadgeTone
}

export interface KpiExplainHero {
  headline: string
  summary: string
}

export interface KpiExplainMetric {
  label: string
  value: string
  unit: string | null
  tone: BadgeTone
  note: string | null
}

export interface KpiExplainSection {
  heading: string
  bullets: string[]
}

export interface KpiExplainTable {
  title: string
  columns: string[]
  rows: string[][]
}

export interface KpiExplainConfidence {
  level: 'high' | 'low'
  reason: string
  limitations: string[]
}

export interface KpiExplainNextAction {
  priority: PriorityLevel
  action: string
  why: string
}

export interface KpiExplainStructuredResponse {
  title: string
  subtitle: string
  badges: KpiExplainBadge[]
  hero: KpiExplainHero | null
  metrics: KpiExplainMetric[]
  sections: KpiExplainSection[]
  table: KpiExplainTable | null
  confidence: KpiExplainConfidence | null
  next_actions: KpiExplainNextAction[]
  disclaimer: string
}
