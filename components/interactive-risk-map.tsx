'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'

/** Анимация подсчёта от start к value за duration мс (при смене value — от предыдущего к новому) */
function useCountUp(value: number | null, durationMs: number, enabled: boolean) {
  const [display, setDisplay] = useState(0)
  const prevValue = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) {
      setDisplay(0)
      prevValue.current = null
      return
    }
    if (value == null) {
      setDisplay(0)
      return
    }
    const start = prevValue.current ?? 0
    prevValue.current = value
    const startTime = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / durationMs, 1)
      const eased = 1 - (1 - t) ** 2
      const v = start + (value - start) * eased
      setDisplay(Math.round(v * 10) / 10)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value, durationMs, enabled])
  return display
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  DollarSign,
  Wheat,
  MapPin,
  Brain,
  ArrowLeft,
  Leaf,
  Droplet,
  Flame,
  TrendingDown,
  Info,
  AlertTriangle
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import {
  centralAsianCountries,
  availableYears,
} from '@/data/regions-data'
import type { KpiCardId } from '@/lib/gemini'
import type { KpiExplainGroup, KpiExplainKey, KpiExplainStructuredResponse } from '@/lib/kpi-explain-types'
import { KpiExplainModal } from '@/components/KpiExplainModal'

import dynamic from 'next/dynamic'

// Types for GeoJSON
interface GeoJSONFeature {
  type: 'Feature'
  properties: {
    name?: string
    ADM1_EN?: string
    ADM1_RU?: string
    [key: string]: any
  }
  geometry: any
}

interface GeoJSONData {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// Exact mapping from region names to file names
const regionFileMap: Record<string, string> = {
  'Toshkent sh.': 'toshkent',
  'Toshkent viloyati': 'toshkent',
  'Namangan viloyati': 'namangan',
  "Farg'ona viloyati": 'fargona',
  'Andijon viloyati': 'andijon',
  'Sirdaryo viloyati': 'sirdaryo',
  'Jizzax viloyati': 'jizzax',
  'Navoiy viloyati': 'navoiy',
  'Samarqand viloyati': 'samarqand',
  'Qashqadaryo viloyati': 'qashqadaryo',
  'Surxondaryo viloyati': 'surxondaryo',
  'Buxoro viloyati': 'buxoro',
  'Xorazm viloyati': 'xorazm',
  'Qoraqalpogʻiston Respublikasi': 'qoraqalpogiston',
}

// Leaflet map component (loaded dynamically to avoid SSR issues)
const LeafletMap = dynamic(
  () => import('./leaflet-map-inner').then(mod => mod.LeafletMapInner),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#eff6ff]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }
)

interface KPICardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  subtitle?: string
  onClick?: () => void
}

function KPICard({ title, value, icon, subtitle, onClick }: KPICardProps) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`p-4 bg-card border-border rounded-2xl shadow-[0_14px_40px_-12px_rgba(0,0,0,0.28)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_48px_-14px_rgba(0,0,0,0.35)] ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-xl font-bold text-foreground">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Card>
  )
}

interface InteractiveRiskMapProps {
  className?: string
}

interface DashboardMetrics {
  riskScore: number
  valueAtRisk: string
  yieldAnomaly: string
  p10: number
  p50: number
  p90: number
  spread: number
  confidenceLabel: string
  riskCategory?: string
}

/** Ответ GET /dashboard/kpi-cards */
interface KpiCardsData {
  yield_anomaly_p50: { value: number; unit: string; trend: string }
  downside_risk_p10: { value: number; unit: string; min_p10?: number }
  portfolio_risk_share: { high: number; moderate: number; low: number; method?: string }
  dscr: { p50: number; p10: number; status: string }
  vegetation_health?: {
    value: number
    status: 'good' | 'watch' | 'poor'
    ndvi_current: number
    ndvi_baseline_p10: number
    ndvi_baseline_p90: number
  } | null
  season_stress?: {
    value: number
    level: 'low' | 'medium' | 'high'
    components: { drought: number; heat: number; ndvi_drop: number }
  } | null
  meta?: {
    rows_used: number
    year_used: number
    fallback: string
    data_confidence: string
    scope_hash?: string
    baseline_fallback?: string
    baseline_years_used?: number
    satellite_warning?: string
    ndvi_prev_missing?: boolean
  }
}

export function InteractiveRiskMap({ className }: InteractiveRiskMapProps) {
  const { t } = useLanguage()
  const [isMobile, setIsMobile] = useState(false)
  
  // Filter states
  const [selectedCountry, setSelectedCountry] = useState<string>('UZB')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedYear, setSelectedYear] = useState<string>('current')
  
  // Map data states
  const [regionsGeoJSON, setRegionsGeoJSON] = useState<GeoJSONData | null>(null)
  const [districtsGeoJSON, setDistrictsGeoJSON] = useState<GeoJSONData | null>(null)
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false)
  
  // Selection states
  const [hoveredArea, setHoveredArea] = useState<string | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [selectedDistrictData, setSelectedDistrictData] = useState<DashboardMetrics | null>(null)
  const [displayName, setDisplayName] = useState<string>('National Average')
  const [isKpiLoading, setIsKpiLoading] = useState(false)
  const [kpiError, setKpiError] = useState<string | null>(null)
  const [kpiCardsData, setKpiCardsData] = useState<KpiCardsData | null>(null)
  const [kpiCardsLoading, setKpiCardsLoading] = useState(true)
  const [kpiCardsError, setKpiCardsError] = useState<string | null>(null)
  const [satelliteNoData, setSatelliteNoData] = useState(false)
  
  // AI explain modal (legacy plain text — unused when using structured modal)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainCardId, setExplainCardId] = useState<KpiCardId | null>(null)
  const [explainText, setExplainText] = useState<string>('')
  const [explainIsMock, setExplainIsMock] = useState(false)
  const [explainLoading, setExplainLoading] = useState(false)

  // Structured KPI explain modal (JSON UI)
  const [explainStructuredOpen, setExplainStructuredOpen] = useState(false)
  const [explainStructuredLoading, setExplainStructuredLoading] = useState(false)
  const [explainStructuredError, setExplainStructuredError] = useState<string | null>(null)
  const [explainStructuredData, setExplainStructuredData] = useState<KpiExplainStructuredResponse | null>(null)
  const [explainStructuredKpiKey, setExplainStructuredKpiKey] = useState<KpiExplainKey | null>(null)
  const [explainStructuredKpiGroup, setExplainStructuredKpiGroup] = useState<KpiExplainGroup | null>(null)
  
  // Track if we should fit bounds (only on initial load or region change)
  const [shouldFitBounds, setShouldFitBounds] = useState(true)
  
  // Get current country data
  const currentCountry = useMemo(() => 
    centralAsianCountries.find(c => c.code === selectedCountry) || centralAsianCountries[0],
    [selectedCountry]
  )
  
  // Get regions list from GeoJSON
  const regionsList = useMemo(() => {
    if (!regionsGeoJSON) return []
    return regionsGeoJSON.features.map(f => ({
      name: f.properties.name || f.properties.ADM1_EN || '',
      nameRu: f.properties.ADM1_RU || ''
    }))
  }, [regionsGeoJSON])
  
  // Load regions GeoJSON
  useEffect(() => {
    if (selectedCountry === 'UZB') {
      fetch('/regions.json')
        .then(res => res.json())
        .then(data => {
          setRegionsGeoJSON(data)
          setShouldFitBounds(true)
        })
        .catch(err => {
          console.error('Failed to load regions GeoJSON:', err)
        })
    } else {
      setRegionsGeoJSON(null)
    }
  }, [selectedCountry])
  
  // Load districts when region is selected
  useEffect(() => {
    if (selectedRegion !== 'all' && selectedCountry === 'UZB') {
      setIsLoadingDistricts(true)
      
      // Get the correct file name from the mapping
      const fileName = regionFileMap[selectedRegion]
      
      if (!fileName) {
        console.error('No file mapping for region:', selectedRegion)
        setIsLoadingDistricts(false)
        return
      }
      
      fetch(`/districts/${fileName}.json`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(data => {
          setDistrictsGeoJSON(data)
          setIsLoadingDistricts(false)
          setShouldFitBounds(true)
        })
        .catch(err => {
          console.error('Failed to load districts GeoJSON:', err, 'File:', fileName)
          setIsLoadingDistricts(false)
          setDistrictsGeoJSON(null)
        })
    } else {
      setDistrictsGeoJSON(null)
    }
  }, [selectedRegion, selectedCountry])
  
  // Handle region click (from map)
  const handleRegionClick = useCallback((regionName: string) => {
    setSelectedRegion(regionName)
    setSelectedDistrict(null)
    setDisplayName(regionName)
  }, [])
  
  // Handle district hover
  const handleDistrictHover = useCallback((districtName: string | null) => {
    setHoveredArea(districtName)
  }, [])
  
  // Handle district click - update KPI only on click
  const handleDistrictClick = useCallback((districtName: string) => {
    setSelectedDistrict(districtName)
    setShouldFitBounds(false) // Don't reset zoom on click
    setDisplayName(districtName)
  }, [])
  
  // Handle back to regions
  const handleBackToRegions = useCallback(() => {
    setSelectedRegion('all')
    setDistrictsGeoJSON(null)
    setSelectedDistrict(null)
    setDisplayName('National Average')
    setShouldFitBounds(true)
  }, [])
  
  // Called after bounds are fitted
  const handleBoundsFitted = useCallback(() => {
    setShouldFitBounds(false)
  }, [])
  
  // Reset when country changes
  useEffect(() => {
    setSelectedRegion('all')
    setDistrictsGeoJSON(null)
    setSelectedDistrict(null)
    setDisplayName('National Average')
    setHoveredArea(null)
    setShouldFitBounds(true)
  }, [selectedCountry])

  const apiBaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:8000'
  const { language } = useLanguage()

  const fetchDashboardMetrics = useCallback(async () => {
    const scope = selectedDistrict
      ? 'district'
      : selectedRegion !== 'all'
        ? 'region'
        : 'country'
    const areaName = selectedDistrict || (selectedRegion !== 'all' ? selectedRegion : '')
    const yearValue = selectedYear === 'current' ? new Date().getFullYear() : Number(selectedYear)

    setIsKpiLoading(true)
    setKpiError(null)
    try {
      const url = new URL('/dashboard/metrics', apiBaseUrl)
      url.searchParams.set('country', selectedCountry)
      url.searchParams.set('year', String(yearValue))
      url.searchParams.set('scope', scope)
      url.searchParams.set('lang', language)
      if (areaName) {
        url.searchParams.set('area_name', areaName)
      }
      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setSelectedDistrictData(data)
    } catch (err: any) {
      const msg = err?.message || ''
      const isConnectionRefused = msg.includes('Failed to fetch') || msg.includes('Load failed') || msg.includes('NetworkError')
      setKpiError(
        isConnectionRefused
          ? 'Dashboard API недоступен. Запустите бэкенд: cd backend/services/dashboard && pip install -r requirements.txt && uvicorn app:app --port 8000'
          : 'Failed to load KPI data'
      )
      if (process.env.NODE_ENV === 'development') {
        console.error('[fetchDashboardMetrics]', err)
      }
    } finally {
      setIsKpiLoading(false)
    }
  }, [apiBaseUrl, selectedCountry, selectedRegion, selectedDistrict, selectedYear, language])

  useEffect(() => {
    fetchDashboardMetrics()
  }, [fetchDashboardMetrics])

  const fetchKpiCards = useCallback(async () => {
    const regionLevel = selectedDistrict ? 'district' : selectedRegion !== 'all' ? 'oblast' : 'country'
    const regionId = selectedDistrict || (selectedRegion !== 'all' ? selectedRegion : null)
    const yearValue = selectedYear === 'current' ? new Date().getFullYear() : Number(selectedYear)
    setKpiCardsData(null)
    setKpiCardsLoading(true)
    setKpiCardsError(null)
    setSatelliteNoData(false)
    try {
      const url = new URL('/dashboard/kpi-cards', apiBaseUrl)
      url.searchParams.set('country', selectedCountry)
      url.searchParams.set('region_level', regionLevel)
      if (regionId) url.searchParams.set('region_id', regionId)
      url.searchParams.set('crop', 'wheat')
      url.searchParams.set('year', String(yearValue))
      const res = await fetch(url.toString())
      if (res.status === 404) {
        setSatelliteNoData(true)
        setKpiCardsData(null)
        setKpiCardsError(null)
        return
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data: KpiCardsData = await res.json()
      setKpiCardsData(data)
      setKpiCardsError(null)
    } catch (err: any) {
      const msg = err?.message || 'Failed to load KPI'
      setKpiCardsError(msg)
      if (process.env.NODE_ENV === 'development') {
        console.error('[fetchKpiCards]', err)
      }
    } finally {
      setKpiCardsLoading(false)
    }
  }, [apiBaseUrl, selectedCountry, selectedRegion, selectedDistrict, selectedYear])

  useEffect(() => {
    fetchKpiCards()
  }, [fetchKpiCards])

  const handleKpiCardClick = useCallback(async (cardId: KpiCardId) => {
    setExplainCardId(cardId)
    setExplainOpen(true)
    setExplainText('')
    setExplainLoading(true)
    try {
      const metrics = selectedDistrictData
        ? {
            location: displayName,
            valueAtRisk: selectedDistrictData.valueAtRisk,
            riskScore: selectedDistrictData.riskScore,
            yieldAnomaly: selectedDistrictData.yieldAnomaly,
            p10: selectedDistrictData.p10,
            p50: selectedDistrictData.p50,
            p90: selectedDistrictData.p90,
            spread: selectedDistrictData.spread,
            confidenceLabel: selectedDistrictData.confidenceLabel,
          }
        : { location: displayName }
      const res = await fetch(`${apiBaseUrl}/dashboard/explain-kpi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, ...metrics, language }),
      })
      const data = await res.json()
      setExplainText(data.explanation || 'Не удалось загрузить объяснение.')
      setExplainIsMock(!!data.isMock)
    } catch {
      setExplainText('Ошибка загрузки объяснения. Попробуйте позже.')
      setExplainIsMock(false)
    } finally {
      setExplainLoading(false)
    }
  }, [displayName, selectedDistrictData, language])

  const currentGeoJSON = selectedRegion !== 'all' && districtsGeoJSON ? districtsGeoJSON : regionsGeoJSON
  const isShowingDistricts = selectedRegion !== 'all' && districtsGeoJSON !== null
  const yearValue = selectedYear === 'current' ? new Date().getFullYear() : Number(selectedYear)
  const regionLevel: 'country' | 'oblast' | 'district' = selectedRegion === 'all' ? 'country' : (isShowingDistricts ? 'district' : 'oblast')
  const regionId = selectedRegion === 'all' ? null : (isShowingDistricts ? selectedDistrict : selectedRegion)

  const handleKpiExplainClick = useCallback(async (kpiGroup: KpiExplainGroup, kpiKey: KpiExplainKey) => {
    setExplainStructuredKpiKey(kpiKey)
    setExplainStructuredKpiGroup(kpiGroup)
    setExplainStructuredOpen(true)
    setExplainStructuredError(null)
    setExplainStructuredData(null)
    setExplainStructuredLoading(true)

    const scope = {
      country: selectedCountry,
      region_level: regionLevel,
      region_id: regionId,
      crop: 'wheat',
      year: yearValue,
    }
    const meta = kpiCardsData?.meta ? {
      rows_used: kpiCardsData.meta.rows_used,
      year_used: kpiCardsData.meta.year_used,
      fallback: kpiCardsData.meta.fallback as 'none' | 'oblast' | 'country' | undefined,
      data_confidence: kpiCardsData.meta.data_confidence as 'high' | 'low' | undefined,
    } : undefined

    let kpi_values: Record<string, unknown> = {}
    if (kpiKey === 'yield_anomaly' && kpiCardsData?.yield_anomaly_p50) {
      kpi_values = { ...kpiCardsData.yield_anomaly_p50 }
    } else if (kpiKey === 'downside_risk' && kpiCardsData?.downside_risk_p10) {
      kpi_values = { ...kpiCardsData.downside_risk_p10 }
    } else if (kpiKey === 'high_risk_share' && kpiCardsData?.portfolio_risk_share) {
      kpi_values = { ...kpiCardsData.portfolio_risk_share }
    } else if (kpiKey === 'dscr' && kpiCardsData?.dscr) {
      kpi_values = { ...kpiCardsData.dscr }
    } else if (kpiKey === 'vegetation_health' && kpiCardsData?.vegetation_health) {
      kpi_values = { ...kpiCardsData.vegetation_health }
    } else if (kpiKey === 'season_stress' && kpiCardsData?.season_stress) {
      kpi_values = { ...kpiCardsData.season_stress }
    }

    try {
      const res = await fetch(`${apiBaseUrl}/dashboard/kpi-explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpi_group: kpiGroup, kpi_key: kpiKey, scope, kpi_values, meta }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const data: KpiExplainStructuredResponse = await res.json()
      setExplainStructuredData(data)
    } catch (e) {
      setExplainStructuredError(e instanceof Error ? e.message : 'Failed to load explanation')
    } finally {
      setExplainStructuredLoading(false)
    }
  }, [selectedCountry, selectedRegion, selectedDistrict, selectedYear, isShowingDistricts, kpiCardsData, apiBaseUrl])

  const kpiP50 = kpiCardsData?.yield_anomaly_p50.value ?? null
  const kpiP10 = kpiCardsData?.downside_risk_p10.value ?? null
  const kpiHigh = kpiCardsData?.portfolio_risk_share.high ?? null
  const kpiDscr50 = kpiCardsData?.dscr.p50 ?? null
  const kpiDscr10 = kpiCardsData?.dscr.p10 ?? null
  const kpiReady = !kpiCardsLoading && !!kpiCardsData
  const animP50 = useCountUp(kpiP50, 700, kpiReady)
  const animP10 = useCountUp(kpiP10, 700, kpiReady)
  const animHigh = useCountUp(kpiHigh, 700, kpiReady)
  const animDscr50 = useCountUp(kpiDscr50, 700, kpiReady)
  const animDscr10 = useCountUp(kpiDscr10, 700, kpiReady)
  const vegValue = kpiCardsData?.vegetation_health?.value ?? null
  const vegStatus = kpiCardsData?.vegetation_health?.status ?? null
  const stressValue = kpiCardsData?.season_stress?.value ?? null
  const stressLevel = kpiCardsData?.season_stress?.level ?? null
  const stressComponents = kpiCardsData?.season_stress?.components
  const baselineYears = kpiCardsData?.meta?.baseline_years_used ?? null
  const baselineFallback = kpiCardsData?.meta?.baseline_fallback ?? 'none'
  const dataConfidence = kpiCardsData?.meta?.data_confidence ?? 'high'
  const satelliteMetaTooltip = `baseline years used: ${baselineYears ?? 'n/a'}; fallback: ${baselineFallback}; confidence: ${dataConfidence}`

  // Yield anomaly per area (region or district) for map coloring — с ограничением параллельных запросов и отменой
  const [yieldAnomalyByArea, setYieldAnomalyByArea] = useState<Record<string, number>>({})
  const [yieldAnomalyLoading, setYieldAnomalyLoading] = useState(false)
  const fetchKeyRef = useRef<string>('')
  const kpiCarouselRef = useRef<HTMLDivElement>(null)
  const kpiSlideRefs = useRef<Array<HTMLDivElement | null>>([])
  const [kpiSlideIndex, setKpiSlideIndex] = useState(0)
  const CONCURRENCY = 4

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (selectedCountry !== 'UZB' || !currentGeoJSON?.features?.length) {
      fetchKeyRef.current = ''
      setYieldAnomalyByArea({})
      setYieldAnomalyLoading(false)
      return
    }
    const yearValue = selectedYear === 'current' ? new Date().getFullYear() : Number(selectedYear)
    const scope = isShowingDistricts ? 'district' : 'region'
    const getAreaName = (f: GeoJSONFeature) => f.properties?.name || f.properties?.ADM1_EN || ''
    const areaNames = currentGeoJSON.features.map(getAreaName).filter(Boolean)
    const fetchKey = `${scope}-${yearValue}-${[...areaNames].sort().join('|')}`
    if (fetchKeyRef.current === fetchKey) return
    fetchKeyRef.current = fetchKey

    const abort = new AbortController()
    setYieldAnomalyLoading(true)
    const crop = 'wheat'

    async function runWithLimit() {
      const results: { areaName: string; p50: number | null }[] = []
      for (let i = 0; i < areaNames.length; i += CONCURRENCY) {
        if (abort.signal.aborted) return
        const chunk = areaNames.slice(i, i + CONCURRENCY)
        const chunkResults = await Promise.all(
          chunk.map(async (areaName) => {
            try {
              const url = new URL('/dashboard/metrics', apiBaseUrl)
              url.searchParams.set('country', selectedCountry)
              url.searchParams.set('year', String(yearValue))
              url.searchParams.set('scope', scope)
              url.searchParams.set('area_name', areaName)
              url.searchParams.set('crop', crop)
              const res = await fetch(url.toString(), { signal: abort.signal })
              if (!res.ok) return { areaName, p50: null as number | null }
              const data = await res.json()
              let p50: number | null = null
              if (typeof data.p50 === 'number' && !Number.isNaN(data.p50)) {
                const v = data.p50
                p50 = Math.abs(v) < 1 && v !== 0 ? v * 100 : v
              } else if (data.yieldAnomaly != null) {
                const s = String(data.yieldAnomaly).replace(/\s/g, '').replace(/%/g, '')
                const n = parseFloat(s)
                if (!Number.isNaN(n)) p50 = Math.abs(n) < 1 && n !== 0 ? n * 100 : n
              }
              return { areaName, p50 }
            } catch {
              return { areaName, p50: null as number | null }
            }
          })
        )
        if (abort.signal.aborted) return
        results.push(...chunkResults)
        setYieldAnomalyByArea((prev) => {
          const next = { ...prev }
          chunkResults.forEach(({ areaName, p50 }) => {
            if (p50 != null) next[areaName] = p50
          })
          return next
        })
      }
      if (!abort.signal.aborted) setYieldAnomalyLoading(false)
    }

    runWithLimit()
    return () => abort.abort()
  }, [selectedCountry, selectedYear, currentGeoJSON, isShowingDistricts, apiBaseUrl])

  const kpiSlides = [
    {
      title: 'Yield Anomaly (p50)',
      value: kpiReady ? `${animP50}%` : '—',
      valueClass: kpiP50 != null && kpiP50 < 0 ? 'text-red-600 dark:text-red-400' : kpiP50 != null && kpiP50 > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100',
      sub: 'Mid-case anomaly',
    },
    {
      title: 'Downside Risk (p10)',
      value: kpiReady ? `${animP10}%` : '—',
      valueClass: 'text-slate-800 dark:text-slate-100',
      sub: 'Stress scenario',
    },
    {
      title: 'High Risk Share',
      value: kpiReady ? `${animHigh}%` : '—',
      valueClass: 'text-red-600 dark:text-red-400',
      sub: 'Portfolio concentration',
    },
    {
      title: 'DSCR (p50 / p10)',
      value: kpiReady ? `${animDscr50} / ${animDscr10}` : '—',
      valueClass: 'text-slate-800 dark:text-slate-100',
      sub: kpiCardsData?.dscr?.status ? `Status: ${kpiCardsData.dscr.status}` : 'Debt coverage',
    },
  ]

  useEffect(() => {
    if (!isMobile || kpiSlides.length <= 1) return
    const timer = window.setInterval(() => {
      setKpiSlideIndex((prev) => (prev + 1) % kpiSlides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [isMobile, kpiSlides.length])

  useEffect(() => {
    if (!isMobile) return
    const target = kpiSlideRefs.current[kpiSlideIndex]
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [isMobile, kpiSlideIndex])

  return (
    <div className={`w-full h-full min-h-0 flex flex-col ${className ?? ''}`}>
      {/* Карта на весь экран; KPI карточки закомментированы ниже */}
      <div className="w-full h-full min-h-0 flex flex-col relative">
        {/* Map — на весь доступный экран, без обёртки Card */}
        <div className="w-full h-full min-h-0 overflow-hidden relative z-0">
            {isLoadingDistricts && (
              <div className="absolute inset-0 bg-background/80 z-10 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            
            {currentCountry.hasGeoJSON && currentGeoJSON ? (
              <LeafletMap
                geoJSONData={currentGeoJSON}
                center={currentCountry.center}
                zoom={isShowingDistricts ? 8 : currentCountry.zoom}
                onAreaHover={handleDistrictHover}
                onAreaClick={isShowingDistricts ? handleDistrictClick : handleRegionClick}
                hoveredArea={hoveredArea}
                selectedArea={selectedDistrict}
                isShowingDistricts={isShowingDistricts}
                shouldFitBounds={shouldFitBounds}
                onBoundsFitted={handleBoundsFitted}
                yieldAnomalyByArea={yieldAnomalyByArea}
                yieldAnomalyLoading={yieldAnomalyLoading}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#eff6ff] dark:bg-slate-900">
                <div className="text-center p-8">
                  <MapPin className="w-16 h-16 text-primary/30 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {currentCountry.name}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Map data is currently available only for Uzbekistan.
                  </p>
                </div>
              </div>
            )}
        </div>

        {/* Desktop KPI overlays */}
        <div className="hidden md:flex absolute top-3 right-3 bottom-20 z-[100] flex-col items-end">
          <div className="flex flex-col gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5 w-[280px]">
            {kpiCardsLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-slate-200/50 dark:bg-slate-700/50 animate-pulse" />
                ))}
              </>
            ) : (
              <>
                <button type="button" onClick={() => handleKpiExplainClick('finance', 'yield_anomaly')} className="text-left rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Yield Anomaly (p50)</p>
                  <p className={`text-5xl font-bold tabular-nums leading-tight ${kpiP50 != null && kpiP50 < 0 ? 'text-red-600 dark:text-red-400' : kpiP50 != null && kpiP50 > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {kpiReady ? `${animP50}%` : '—'}
                  </p>
                </button>
                <button type="button" onClick={() => handleKpiExplainClick('finance', 'downside_risk')} className="text-left rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Downside Risk (p10)</p>
                  <p className="text-5xl font-bold tabular-nums leading-tight text-slate-800 dark:text-slate-100">{kpiReady ? `${animP10}%` : '—'}</p>
                </button>
                <button type="button" onClick={() => handleKpiExplainClick('finance', 'high_risk_share')} className="text-left rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">High Risk Share</p>
                  <p className="text-5xl font-bold tabular-nums leading-tight text-red-600 dark:text-red-400">{kpiReady ? `${animHigh}%` : '—'}</p>
                </button>
                <button type="button" onClick={() => handleKpiExplainClick('finance', 'dscr')} className="text-left rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">DSCR (p50 / p10)</p>
                  <p className="text-5xl font-bold tabular-nums leading-tight text-slate-800 dark:text-slate-100">
                    {kpiReady ? `${animDscr50} / ${animDscr10}` : '—'}
                  </p>
                  {kpiCardsData?.dscr?.status && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">{kpiCardsData.dscr.status}</p>
                  )}
                </button>
                {kpiCardsError && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-600/60">
                    <p className="text-xs text-red-600 dark:text-red-400 truncate" title={kpiCardsError}>{kpiCardsError}</p>
                    <button type="button" onClick={() => fetchKpiCards()} className="mt-1 text-xs font-medium text-primary hover:underline">Повторить</button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-3 w-[280px] bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Satellite Monitoring</p>
              <div className="flex items-center gap-1">
                {dataConfidence === 'low' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Low confidence" />
                )}
                <Info className="w-3.5 h-3.5 text-slate-400" title={satelliteMetaTooltip} />
              </div>
            </div>
            {kpiCardsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 rounded-xl bg-slate-200/50 dark:bg-slate-700/50 animate-pulse" />
                <div className="h-16 rounded-xl bg-slate-200/50 dark:bg-slate-700/50 animate-pulse" />
              </div>
            ) : satelliteNoData ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                No satellite baseline available
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => handleKpiExplainClick('satellite', 'vegetation_health')} className="text-left space-y-1 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Leaf className={`w-4 h-4 text-emerald-600 ${vegStatus && vegStatus !== 'good' ? 'animate-pulse' : ''}`} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vegetation</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">
                    {vegValue != null ? vegValue.toFixed(2) : '—'}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                    vegStatus === 'good' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    vegStatus === 'watch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    vegStatus === 'poor' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {vegStatus ?? 'n/a'}
                  </span>
                  <div className="h-1.5 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((vegValue ?? 0) * 100)}%` }}
                    />
                  </div>
                </button>
                <button type="button" onClick={() => handleKpiExplainClick('satellite', 'season_stress')} className="relative text-left space-y-1 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors p-1 -m-1 cursor-pointer">
                  {stressLevel === 'high' && (
                    <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,120,0,0.25),transparent_60%)] animate-pulse" />
                  )}
                  <div className="flex items-center gap-1.5 relative z-10">
                    <Flame className={`w-4 h-4 ${stressLevel === 'high' ? 'text-red-500' : 'text-slate-400'}`} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Stress</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums relative z-10 text-slate-800 dark:text-slate-100">
                    {stressValue != null ? stressValue.toFixed(2) : '—'}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase relative z-10 ${
                    stressLevel === 'low' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    stressLevel === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    stressLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {stressLevel ?? 'n/a'}
                  </span>
                  <div className="flex items-center gap-1.5 pt-0.5 relative z-10">
                    <span className={`p-1 rounded-full ${stressComponents?.drought ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300'}`} title="Drought">
                      <Droplet className="w-3 h-3" />
                    </span>
                    <span className={`p-1 rounded-full ${stressComponents?.heat ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300'}`} title="Heat">
                      <Flame className="w-3 h-3" />
                    </span>
                    <span className={`p-1 rounded-full ${stressComponents?.ndvi_drop ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300'}`} title="NDVI drop">
                      <TrendingDown className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              </div>
            )}
            {process.env.NODE_ENV === 'development' && (
              <button
                type="button"
                onClick={() => console.log('[Satellite KPI meta]', kpiCardsData?.meta)}
                className="mt-2 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Debug meta
              </button>
            )}
          </div>
        </div>

        {/* Mobile KPI carousel: above bottom main menu */}
        {isMobile && (
          <div className="absolute left-0 right-0 bottom-[72px] z-[110] px-3">
            <div
              ref={kpiCarouselRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-none"
              onScroll={(e) => {
                const el = e.currentTarget
                const children = Array.from(el.children) as HTMLElement[]
                if (!children.length) return
                const center = el.scrollLeft + el.clientWidth / 2
                let closest = 0
                let bestDist = Number.POSITIVE_INFINITY
                children.forEach((child, idx) => {
                  const childCenter = child.offsetLeft + child.clientWidth / 2
                  const d = Math.abs(center - childCenter)
                  if (d < bestDist) {
                    bestDist = d
                    closest = idx
                  }
                })
                setKpiSlideIndex(closest)
              }}
            >
              {kpiSlides.map((slide, idx) => (
                <div
                  key={slide.title}
                  ref={(el) => { kpiSlideRefs.current[idx] = el }}
                  className="min-w-[90%] snap-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/10"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{slide.title}</p>
                  <p className={`text-4xl font-bold tabular-nums leading-tight ${slide.valueClass}`}>{slide.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{slide.sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              {kpiSlides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setKpiSlideIndex(idx)}
                  className={`h-1.5 rounded-full transition-all ${idx === kpiSlideIndex ? 'w-5 bg-primary' : 'w-2 bg-slate-300 dark:bg-slate-600'}`}
                  aria-label={`Go to KPI slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className={`absolute z-[100] flex flex-col gap-2 items-start ${isMobile ? 'bottom-[8px] left-2 right-2' : 'bottom-3 left-3'}`}>
          {isShowingDistricts && (
            <button
              type="button"
              onClick={handleBackToRegions}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              Back to Regions
            </button>
          )}
          <div className={`flex flex-wrap gap-2 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5 ${isMobile ? 'w-full' : ''}`}>
            <div className={`space-y-0.5 ${isMobile ? 'min-w-0 flex-1' : 'min-w-[120px]'}`}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Country</label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="bg-card border-border h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[200]" side="top" sideOffset={4} position="popper">
                  {centralAsianCountries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={`space-y-0.5 ${isMobile ? 'min-w-0 flex-1' : 'min-w-[140px]'}`}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Region</label>
              <Select value={selectedRegion} onValueChange={(value) => {
                if (value === 'all') {
                  handleBackToRegions()
                } else {
                  setSelectedRegion(value)
                  setSelectedDistrict(null)
                  setDisplayName(value)
                }
              }}>
                <SelectTrigger className="bg-card border-border h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[200]" side="top" sideOffset={4} position="popper">
                  <SelectItem value="all">All Regions</SelectItem>
                  {regionsList.map((region) => (
                    <SelectItem key={region.name} value={region.name}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={`space-y-0.5 ${isMobile ? 'min-w-0 flex-1' : 'min-w-[100px]'}`}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="bg-card border-border h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[200]" side="top" sideOffset={4} position="popper">
                  {availableYears.map((year) => (
                    <SelectItem key={year.value} value={year.value}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Structured KPI explain modal (JSON UI) */}
      <KpiExplainModal
        open={explainStructuredOpen}
        onOpenChange={setExplainStructuredOpen}
        loading={explainStructuredLoading}
        error={explainStructuredError}
        data={explainStructuredData}
        onRetry={() => {
          if (explainStructuredKpiGroup && explainStructuredKpiKey) {
            handleKpiExplainClick(explainStructuredKpiGroup, explainStructuredKpiKey)
          }
        }}
        cardTitle={explainStructuredKpiKey ? String(explainStructuredKpiKey).replace(/_/g, ' ') : 'KPI'}
      />

      {/* Legacy AI explain modal (plain text) */}
      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {explainCardId === 'portfolio' && 'Portfolio Value at Risk'}
              {explainCardId === 'yield' && 'Yield Anomaly Forecast'}
              {explainCardId === 'confidence' && 'Basis Risk / Model Confidence'}
            </DialogTitle>
          </DialogHeader>
          {explainLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {explainIsMock && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  Справочное объяснение (ИИ недоступен). Задайте GEMINI_API_KEY в .env.local для ответов от ИИ.
                </p>
              )}
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {explainText}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
