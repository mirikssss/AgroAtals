/**
 * JSON DB for saved fields (localStorage). Key: agro-fields
 */

export interface SavedFieldMetadata {
  id: string
  addedAt: string // ISO
  // From analysis
  assetName: string
  region: string
  district: string
  crop: string
  coordinates?: string
  hectares?: string
  loanAmount?: string
  interestRate?: string
  termYears?: string
  // Snapshot of AnalysisResult
  result: {
    predictedYield: number
    yieldAnomaly: number
    riskCategory: 'LOW' | 'MODERATE' | 'HIGH'
    trendDynamics: string
    ndviSlope: number
    htcIndex: number
    confidenceSpread: number
    p10: number
    p50: number
    p90: number
    dscr: number
    annualDebtService: number
    expectedRevenue: number
    aiTips: string[]
  }
}

const STORAGE_KEY = 'agro-fields'

function load(): SavedFieldMetadata[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function save(items: SavedFieldMetadata[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (e) {
    console.error('[fields-db] save failed', e)
  }
}

export function getFields(): SavedFieldMetadata[] {
  return load()
}

export function addField(meta: Omit<SavedFieldMetadata, 'id' | 'addedAt'>): SavedFieldMetadata {
  const items = load()
  const id = `F${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const addedAt = new Date().toISOString()
  const field: SavedFieldMetadata = { ...meta, id, addedAt }
  items.push(field)
  save(items)
  return field
}

export function removeField(id: string): void {
  const items = load().filter((f) => f.id !== id)
  save(items)
}

export function getFieldById(id: string): SavedFieldMetadata | undefined {
  return load().find((f) => f.id === id)
}
