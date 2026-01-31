'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'
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
  ArrowLeft
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import {
  centralAsianCountries,
  availableYears,
} from '@/data/regions-data'
import type { KpiCardId } from '@/lib/gemini'

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

export function InteractiveRiskMap({ className }: InteractiveRiskMapProps) {
  const { t } = useLanguage()
  
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
  
  // AI explain modal
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainCardId, setExplainCardId] = useState<KpiCardId | null>(null)
  const [explainText, setExplainText] = useState<string>('')
  const [explainIsMock, setExplainIsMock] = useState(false)
  const [explainLoading, setExplainLoading] = useState(false)
  
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

  // Current GeoJSON to display
  const currentGeoJSON = selectedRegion !== 'all' && districtsGeoJSON ? districtsGeoJSON : regionsGeoJSON
  const isShowingDistricts = selectedRegion !== 'all' && districtsGeoJSON !== null

  // Yield anomaly per area (region or district) for map coloring
  const [yieldAnomalyByArea, setYieldAnomalyByArea] = useState<Record<string, number>>({})
  const [yieldAnomalyLoading, setYieldAnomalyLoading] = useState(false)
  const fetchKeyRef = useRef<string>('')

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

    setYieldAnomalyLoading(true)
    const crop = 'wheat'

    Promise.all(
      areaNames.map(async (areaName) => {
        try {
          const url = new URL('/dashboard/metrics', apiBaseUrl)
          url.searchParams.set('country', selectedCountry)
          url.searchParams.set('year', String(yearValue))
          url.searchParams.set('scope', scope)
          url.searchParams.set('area_name', areaName)
          url.searchParams.set('crop', crop)
          const res = await fetch(url.toString())
          if (!res.ok) return { areaName, p50: null as number | null }
          const data = await res.json()
          // p50 = yield anomaly in % (backend returns number; if |p50| <= 1.5 assume fraction 0.05 = 5%)
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
    ).then((results) => {
      const byArea: Record<string, number> = {}
      results.forEach(({ areaName, p50 }) => {
        if (p50 != null) byArea[areaName] = p50
      })
      setYieldAnomalyByArea(byArea)
      setYieldAnomalyLoading(false)
    })
  }, [selectedCountry, selectedYear, currentGeoJSON, isShowingDistricts, apiBaseUrl])

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Main Content Row - Map and KPI side by side with equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Left Side - Map */}
        <div className="flex flex-col">
          {/* Back button when viewing districts */}
          {isShowingDistricts && (
            <button
              onClick={handleBackToRegions}
              className="mb-2 flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Regions
            </button>
          )}
          
          {/* Map Container - z-0 so dropdowns (z-100) and header stay above */}
          <Card className="flex-1 h-[520px] overflow-hidden border-border relative z-0">
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
          </Card>

          {/* Filters Row - Below the map, dropdowns open downward with high z-index */}
          <div className="grid grid-cols-3 gap-1 mt-3">
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Country
              </label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="bg-card border-border h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[100]" side="bottom" sideOffset={4} position="popper">
                  {centralAsianCountries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Region
              </label>
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
                <SelectContent className="bg-card border-border z-[100]" side="bottom" sideOffset={4} position="popper">
                  <SelectItem value="all">All Regions</SelectItem>
                  {regionsList.map((region) => (
                    <SelectItem key={region.name} value={region.name}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Year
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="bg-card border-border h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[100]" side="bottom" sideOffset={4} position="popper">
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
        
        {/* Right Side - KPI Cards */}
        <div className="flex flex-col gap-4 h-[520px]">
          {/* Selected Area Header */}
          <Card className="p-4 bg-card border-border rounded-2xl shadow-[0_14px_40px_-12px_rgba(0,0,0,0.28)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_48px_-14px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {selectedDistrict ? 'Selected District' : 'Selected'}
                </p>
                <h2 className="text-base font-bold text-foreground truncate">{displayName}</h2>
                {selectedDistrictData?.riskCategory && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Prediction: <span className="font-medium text-foreground">{selectedDistrictData.riskCategory.replace('_', ' ')}</span>
                  </p>
                )}
              </div>
            </div>
          </Card>
          
          {/* KPI Card 1: Portfolio Value at Risk */}
          <KPICard
            title="Portfolio Value at Risk"
            value={selectedDistrictData ? selectedDistrictData.valueAtRisk : '—'}
            icon={<DollarSign className="w-4 h-4" />}
            subtitle={
              selectedDistrictData
                ? `Risk Score: ${(selectedDistrictData.riskScore * 100).toFixed(0)}%`
                : isKpiLoading ? 'Loading...' : kpiError || 'No data'
            }
            onClick={() => handleKpiCardClick('portfolio')}
          />
          
          {/* KPI Card 2: Yield Anomaly */}
          <KPICard
            title="Yield Anomaly Forecast"
            value={selectedDistrictData ? selectedDistrictData.yieldAnomaly : '—'}
            icon={<Wheat className="w-4 h-4" />}
            subtitle={selectedDistrictData ? 'Compared to 5-year average' : isKpiLoading ? 'Loading...' : kpiError || 'No data'}
            onClick={() => handleKpiCardClick('yield')}
          />
          
          {/* KPI Card 3: Basis Risk / Model Confidence Metrics */}
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick('confidence')}
            onKeyDown={(e) => e.key === 'Enter' && handleKpiCardClick('confidence')}
            className="p-4 bg-card border-border rounded-2xl shadow-[0_14px_40px_-12px_rgba(0,0,0,0.28)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_48px_-14px_rgba(0,0,0,0.35)] flex-1 flex flex-col cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Basis Risk / Model Confidence
              </h3>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Brain className="w-4 h-4" />
              </div>
            </div>
            {selectedDistrictData ? (
              <div className="text-sm text-foreground leading-relaxed flex-1 space-y-1">
                <div>P10: {selectedDistrictData.p10.toFixed(2)}%</div>
                <div>P50: {selectedDistrictData.p50.toFixed(2)}%</div>
                <div>P90: {selectedDistrictData.p90.toFixed(2)}%</div>
                <div>Spread: {selectedDistrictData.spread.toFixed(2)}%</div>
                <div className="text-muted-foreground">{selectedDistrictData.confidenceLabel}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {isKpiLoading ? 'Loading...' : kpiError || 'No data'}
              </p>
            )}
          </Card>
          
          {/* Year indicator */}
          <div className="p-2 rounded-2xl bg-muted/50 text-center shadow-[0_14px_40px_-14px_rgba(0,0,0,0.22)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_48px_-16px_rgba(0,0,0,0.28)]">
            <p className="text-xs text-muted-foreground">
              Data: <span className="font-semibold text-foreground">
                {selectedYear === 'current' ? '2025' : selectedYear}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* AI explain modal for KPI cards */}
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
