'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Satellite,
  CloudRain,
  Thermometer,
  Activity,
  Target,
  BarChart3,
  ArrowRight,
  MapPin,
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { mockDistrictData } from '@/data/regions-data'
import { 
  useAIRecommendation, 
  AIRecommendationTrigger, 
  AIRecommendationContent 
} from '@/components/inline-ai-recommendation'
import type { RegionData } from '@/lib/gemini'
import type { DrawnArea } from '@/components/draw-map'
import { addField } from '@/lib/fields-db'

// Dynamic import for DrawMap (client-side only)
const DrawMap = dynamic(() => import('@/components/draw-map'), { 
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div>
    </div>
  )
})

// Types
type AnalysisPhase = 'input' | 'analyzing' | 'results'

interface LoanParams {
  loanAmount: string
  interestRate: string
  termYears: string
  crop: string
  hectares: string
  drawnArea: DrawnArea | null
}

interface AnalysisResult {
  // Metrics Grid Data
  predictedYield: number // t/ha
  yieldAnomaly: number // percentage
  riskCategory: 'LOW' | 'MODERATE' | 'HIGH'
  trendDynamics: 'Improving' | 'Stable' | 'Declining'
  ndviSlope: number
  htcIndex: number
  confidenceSpread: number
  p10: number
  p50: number
  p90: number
  // DSCR
  dscr: number
  annualDebtService: number
  expectedRevenue: number
  // Location Info
  assetName: string
  region: string
  district: string
  // AI tips from API (Gemini) — фишка продукта
  aiTips: string[]
}

// Chart data types (from API /dashboard/chart-data)
interface ChartDataState {
  ndviAnomalyTimeline: Array<{ year: number; anomaly: number; baseline?: number }>
  riskDistribution: Array<{ name: string; value: number; color: string }>
  precipVsVegetation: Array<{ year: number; precipitation: number; ndvi: number }>
}

const defaultChartData: ChartDataState = {
  ndviAnomalyTimeline: [],
  riskDistribution: [
    { name: 'Low Risk', value: 33, color: '#10B981' },
    { name: 'Moderate Risk', value: 34, color: '#f59e0b' },
    { name: 'High Risk', value: 33, color: '#ef4444' },
  ],
  precipVsVegetation: [],
}

// Analysis Loading Steps (textKey for t())
const analysisSteps = [
  { id: 1, textKey: 'queryingSentinel', icon: Satellite },
  { id: 2, textKey: 'processingNDVI', icon: Activity },
  { id: 3, textKey: 'calculatingUlanova', icon: Target },
  { id: 4, textKey: 'runningQuantile', icon: BarChart3 },
  { id: 5, textKey: 'generatingRisk', icon: AlertTriangle },
]

const DASHBOARD_API_URL = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:8000'

// Base yield (t/ha) by crop for revenue calculation when using model's yield anomaly
const BASE_YIELD_T_HA: Record<string, number> = {
  wheat: 3.0,
  cotton: 2.5,
  rice: 4.0,
  corn: 5.0,
}

// Map backend risk_category to UI risk category
function mapRiskCategory(apiCategory: string): 'LOW' | 'MODERATE' | 'HIGH' {
  const v = (apiCategory || '').toLowerCase()
  if (v === 'low') return 'LOW'
  if (v === 'high' || v === 'moderate_high') return 'HIGH'
  return 'MODERATE'
}

// Parse loan amount / hectares: "45K" -> 45000, "1.5M" -> 1500000, "150" -> 150
function parseAmount(value: string, fallback: number): number {
  const s = String(value || '').trim().toUpperCase().replace(/\s/g, '')
  if (!s) return fallback
  const k = s.replace(/[KК]$/, '')
  const m = s.replace(/[MМ]$/, '')
  if (s.endsWith('K') || s.endsWith('К')) {
    const n = parseFloat(k)
    return Number.isFinite(n) ? n * 1000 : fallback
  }
  if (s.endsWith('M') || s.endsWith('М')) {
    const n = parseFloat(m)
    return Number.isFinite(n) ? n * 1_000_000 : fallback
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : fallback
}

interface AnalyticsModuleProps {
  onFieldAdded?: () => void
}

export function AnalyticsModule({ onFieldAdded }: AnalyticsModuleProps) {
  const { t, language } = useLanguage()
  const [phase, setPhase] = useState<AnalysisPhase>('input')
  const [currentStep, setCurrentStep] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  
  // Form State
  const [loanParams, setLoanParams] = useState<LoanParams>({
    loanAmount: '500000',
    interestRate: '12',
    termYears: '5',
    crop: 'cotton',
    hectares: '150',
    drawnArea: null,
  })

  // Handle form changes
  const handleInputChange = (field: keyof LoanParams, value: string) => {
    setLoanParams(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // Handle drawn area change
  const handleAreaDrawn = useCallback((area: DrawnArea | null) => {
    setLoanParams(prev => ({
      ...prev,
      drawnArea: area,
      // Auto-update hectares from drawn area
      hectares: area?.area ? area.area.toFixed(0) : prev.hectares,
    }))
  }, [])

  // Calculate DSCR
  const calculateDSCR = (loanAmount: number, rate: number, years: number, expectedRevenue: number) => {
    const monthlyRate = rate / 100 / 12
    const months = years * 12
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
    const annualDebtService = monthlyPayment * 12
    return {
      dscr: expectedRevenue / annualDebtService,
      annualDebtService
    }
  }

  // Run Analysis: call prediction model API with user input (crop, year), then build result from API + loan params
  const runAnalysis = async () => {
    setPhase('analyzing')
    setCurrentStep(0)
    setAnalysisError(null)

    const year = new Date().getFullYear()
    const crop = (loanParams.crop || 'wheat').toLowerCase()
    const hectares = parseAmount(loanParams.hectares, 150)
    const loanAmount = parseAmount(loanParams.loanAmount, 500000)
    const interestRate = parseFloat(loanParams.interestRate) || 12
    const termYears = parseFloat(loanParams.termYears) || 5

    // Step 1: call prediction API with user's crop and current year
    setCurrentStep(1)
    let apiData: {
      riskScore: number
      valueAtRisk: string
      yieldAnomaly: string
      p10: number
      p50: number
      p90: number
      spread: number
      confidenceLabel: string
      riskCategory: string
      aiTips?: string[]
    } | null = null

    try {
      const url = new URL('/dashboard/metrics', DASHBOARD_API_URL)
      url.searchParams.set('country', 'UZB')
      url.searchParams.set('year', String(year))
      url.searchParams.set('crop', crop)
      url.searchParams.set('scope', 'country')
      url.searchParams.set('lang', language)
      const requestUrl = url.toString()
      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Calling dashboard API:', requestUrl)
      }
      const res = await fetch(requestUrl)
      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
      }
      apiData = await res.json()
      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Backend response:', { p50: apiData.p50, riskCategory: apiData.riskCategory })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dashboard API unavailable'
      setAnalysisError(
        msg.includes('fetch') || msg.includes('Failed')
          ? t('predictionServiceUnavailable')
          : msg
      )
      setPhase('input')
      return
    }

    // Steps 2–5: show progress
    for (let i = 2; i <= analysisSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 400))
      setCurrentStep(i)
    }

    // Parse model output: yield anomaly is p50 (%), use it to get predicted yield (t/ha)
    const yieldAnomalyPct = apiData.p50
    const baseYield = BASE_YIELD_T_HA[crop] ?? 3.0
    const predictedYieldTHa = baseYield * (1 + yieldAnomalyPct / 100)
    const pricePerTon = crop === 'cotton' ? 1200 : crop === 'wheat' ? 280 : crop === 'rice' ? 350 : 350
    const expectedRevenue = hectares * predictedYieldTHa * pricePerTon

    const { dscr, annualDebtService } = calculateDSCR(loanAmount, interestRate, termYears, expectedRevenue)

    const riskCategory = mapRiskCategory(apiData.riskCategory)
    const trendDynamics: 'Improving' | 'Stable' | 'Declining' =
      yieldAnomalyPct < -5 ? 'Declining' : yieldAnomalyPct > 2 ? 'Improving' : 'Stable'

    const bounds = loanParams.drawnArea?.bounds
    const centerLat = bounds ? ((bounds.north + bounds.south) / 2).toFixed(4) : '41.3775'
    const centerLng = bounds ? ((bounds.east + bounds.west) / 2).toFixed(4) : '64.5853'
    const locationName = `Field ${centerLat}°N, ${centerLng}°E`

    setResult({
      predictedYield: predictedYieldTHa,
      yieldAnomaly: yieldAnomalyPct,
      riskCategory,
      trendDynamics,
      ndviSlope: yieldAnomalyPct < 0 ? -0.012 : 0.008,
      htcIndex: apiData.riskScore < 0.5 ? 0.75 : 0.5 + apiData.riskScore * 0.3,
      confidenceSpread: apiData.spread,
      p10: apiData.p10,
      p50: apiData.p50,
      p90: apiData.p90,
      dscr,
      annualDebtService,
      expectedRevenue,
      assetName: `${loanParams.crop.charAt(0).toUpperCase() + loanParams.crop.slice(1)} Field`,
      region: 'Uzbekistan',
      district: locationName,
      aiTips: Array.isArray(apiData.aiTips) ? apiData.aiTips : [],
    })

    await new Promise(resolve => setTimeout(resolve, 300))
    setPhase('results')
  }

  // Reset to input phase
  const resetAnalysis = () => {
    setPhase('input')
    setResult(null)
    setCurrentStep(0)
    setAnalysisError(null)
  }

  return (
    <div className="space-y-6">
      {/* Phase 1: Input Form */}
      {phase === 'input' && (
        <InputPhase
          loanParams={loanParams}
          onInputChange={handleInputChange}
          onAreaDrawn={handleAreaDrawn}
          onAnalyze={runAnalysis}
          analysisError={analysisError}
        />
      )}

      {/* Phase 2: AI Thinking */}
      {phase === 'analyzing' && (
        <AnalyzingPhase
          currentStep={currentStep}
          steps={analysisSteps.map(s => ({ ...s, text: t(s.textKey) }))}
        />
      )}

      {/* Phase 3: Results Command Center */}
      {phase === 'results' && result && (
        <ResultsPhase
          result={result}
          onReset={resetAnalysis}
          language={language}
          loanParams={loanParams}
          onAddField={onFieldAdded}
        />
      )}
    </div>
  )
}

// Phase 1: Input Component
interface InputPhaseProps {
  loanParams: LoanParams
  onInputChange: (field: keyof LoanParams, value: string) => void
  onAreaDrawn: (area: DrawnArea | null) => void
  onAnalyze: () => void
  analysisError?: string | null
}

function InputPhase({ loanParams, onInputChange, onAreaDrawn, onAnalyze, analysisError }: InputPhaseProps) {
  const { t } = useLanguage()
  const isFormValid = loanParams.drawnArea && loanParams.loanAmount && loanParams.hectares

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-foreground">{t('creditRiskAnalytics')}</h2>
        <p className="text-muted-foreground">
          {t('enterLoanParamsDraw')}
        </p>
      </div>

      {/* Loan Parameters Card */}
      <Card className="p-6 border-border/50 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-border/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-semibold text-sm">1</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t('loanParameters')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('loanAmount')}
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={loanParams.loanAmount}
                onChange={(e) => onInputChange('loanAmount', e.target.value)}
                placeholder="e.g. 45000 or 45K"
                className="bg-input/50 border-border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('interestRate')}
              </label>
              <Input
                type="number"
                step="0.1"
                value={loanParams.interestRate}
                onChange={(e) => onInputChange('interestRate', e.target.value)}
                placeholder="12"
                className="bg-input/50 border-border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('termYears')}
              </label>
              <Input
                type="number"
                value={loanParams.termYears}
                onChange={(e) => onInputChange('termYears', e.target.value)}
                placeholder="5"
                className="bg-input/50 border-border"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Map Drawing Card */}
      <Card className="p-6 border-border/50 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold text-sm">2</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">{t('drawAgriculturalArea')}</h3>
            </div>
            {loanParams.drawnArea && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-[#10B981]" />
                <span className="text-muted-foreground">
                  {loanParams.drawnArea.bounds && (
                    <>
                      {((loanParams.drawnArea.bounds.north + loanParams.drawnArea.bounds.south) / 2).toFixed(4)}°N, {' '}
                      {((loanParams.drawnArea.bounds.east + loanParams.drawnArea.bounds.west) / 2).toFixed(4)}°E
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Map */}
          <DrawMap onAreaDrawn={onAreaDrawn} />

          {/* Crop Type and Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('cropType')}
              </label>
              <Select value={loanParams.crop} onValueChange={(v) => onInputChange('crop', v)}>
                <SelectTrigger className="bg-input/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="cotton">{t('cropCotton')}</SelectItem>
                  <SelectItem value="wheat">{t('cropWheat')}</SelectItem>
                  <SelectItem value="rice">{t('cropRice')}</SelectItem>
                  <SelectItem value="corn">{t('cropCorn')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('areaHectares')}
                {loanParams.drawnArea && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (auto-calculated from drawing)
                  </span>
                )}
              </label>
              <Input
                type="number"
                value={loanParams.hectares}
                onChange={(e) => onInputChange('hectares', e.target.value)}
                placeholder="150"
                className="bg-input/50 border-border"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* API error message */}
      {analysisError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          <strong>{t('analysisUnavailable')}</strong>
          <p className="mt-1">{analysisError}</p>
        </div>
      )}

      {/* Analyze Button */}
      <Button
        onClick={onAnalyze}
        disabled={!isFormValid}
        className="w-full py-6 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all"
      >
        <Satellite className="w-5 h-5 mr-2" />
        {t('runAnalysis')}
        <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  )
}

// Phase 2: Analyzing Component
interface AnalyzingPhaseProps {
  currentStep: number
  steps: Array<{ id: number; text: string; icon: React.ComponentType<{ className?: string }> }>
}

function AnalyzingPhase({ currentStep, steps }: AnalyzingPhaseProps) {
  const { t } = useLanguage()
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-12">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">{t('analyzingRisk')}</h2>
        <p className="text-muted-foreground">
          {t('processingSatellite')}
        </p>
      </div>

      <Card className="p-6 border-border/50">
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isCompleted = index < currentStep
            const isActive = index === currentStep - 1 || (index === 0 && currentStep === 0)
            
            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-50 dark:bg-green-950/30'
                    : isActive
                    ? 'bg-primary/5'
                    : 'opacity-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? 'bg-[#10B981] text-white'
                    : isActive
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span className={`font-medium ${
                  isCompleted
                    ? 'text-green-700 dark:text-green-300'
                    : isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}>
                  {step.text}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${(currentStep / steps.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

// Phase 3: Results Component
interface ResultsPhaseProps {
  result: AnalysisResult
  onReset: () => void
  language: string
  loanParams?: LoanParams
  onAddField?: () => void
}

function ResultsPhase({ result, onReset, language, loanParams, onAddField }: ResultsPhaseProps) {
  const { t } = useLanguage()
  const [chartData, setChartData] = useState<ChartDataState>(defaultChartData)
  const [fieldAdded, setFieldAdded] = useState(false)

  // Fetch chart data from API (dataset-based) when result is available
  useEffect(() => {
    const crop = (result.assetName?.split(' ')[0] || 'cotton').toLowerCase()
    const url = new URL('/dashboard/chart-data', DASHBOARD_API_URL)
    url.searchParams.set('country', 'UZB')
    url.searchParams.set('crop', crop)
    url.searchParams.set('scope', 'country')
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Chart data failed'))))
      .then((data: ChartDataState) => setChartData(data))
      .catch(() => setChartData(defaultChartData))
  }, [result.assetName])

  // Prepare data for AI Recommendation
  const aiRegionData: Partial<RegionData> = {
    region_name: result.district,
    country: 'Uzbekistan',
    crop: result.assetName.split(' ')[0].toLowerCase(),
    year: new Date().getFullYear(),
    risk_category: result.riskCategory === 'LOW' ? 'Low' : result.riskCategory === 'MODERATE' ? 'Moderate' : 'High',
    NDVI: 0.5 + (result.yieldAnomaly / 100) * 0.3,
    NDVI_anomaly: result.yieldAnomaly / 100,
    NDVI_slope: result.ndviSlope,
    precipitation_total_mm: 300 + Math.random() * 100,
    precipitation_anomaly_mm: result.yieldAnomaly * 2,
    temperature_mean_C: 25 + Math.random() * 5,
    drought_proxy: result.htcIndex < 0.7 ? 1 : 0,
    heat_stress_days_proxy: Math.floor(Math.random() * 10),
    elevation: 400,
    slope: 2,
    predictedYield: result.predictedYield,
    yieldAnomaly: result.yieldAnomaly,
    htcIndex: result.htcIndex,
    dscr: result.dscr,
    loanAmount: result.annualDebtService * 5,
  }

  // AI Recommendation state (pass language so Gemini responds in selected language)
  const aiRecommendation = useAIRecommendation(aiRegionData, language)

  return (
    <div className="space-y-6">
      {/* Header with Asset Name & Status */}
      <div className="space-y-4">
        {/* Top row: Title and buttons */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{result.assetName}</h2>
            <p className="text-muted-foreground">{result.region} • {result.district}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`text-sm font-medium px-5 py-2.5 h-10 flex items-center ${
              result.riskCategory === 'LOW'
                ? 'bg-[#D1FAE5] text-[#10B981] dark:bg-[#10B981]/20 dark:text-[#34D399]'
                : result.riskCategory === 'MODERATE'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            }`} title="Crop/field risk from model">
              {result.riskCategory === 'LOW' && <CheckCircle className="w-4 h-4 mr-1.5" />}
              {result.riskCategory === 'MODERATE' && <AlertTriangle className="w-4 h-4 mr-1.5" />}
              {result.riskCategory === 'HIGH' && <AlertTriangle className="w-4 h-4 mr-1.5" />}
              {t('fieldRisk')}: {result.riskCategory === 'LOW' ? t('lowRisk') : result.riskCategory === 'MODERATE' ? t('moderateRisk') : t('highRisk')}
            </Badge>
            
            <Button variant="outline" onClick={onReset} className="h-10 px-5">
              {t('newAnalysis')}
            </Button>
          </div>
        </div>

        {/* AI Recommendation Button - Full width below */}
        <AIRecommendationTrigger 
          isOpen={aiRecommendation.isOpen}
          isHighRisk={result.riskCategory === 'HIGH'}
          onToggle={aiRecommendation.toggle}
          fullWidth
        />
      </div>

      {/* AI Recommendation Expandable Content - Below Header */}
      <AIRecommendationContent
        isOpen={aiRecommendation.isOpen}
        loading={aiRecommendation.loading}
        error={aiRecommendation.error}
        recommendation={aiRecommendation.recommendation}
        regionData={aiRegionData}
        onClose={aiRecommendation.close}
        onRefresh={aiRecommendation.refresh}
      />

      {/* DSCR Summary Card */}
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/0 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center px-4 border-r border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">DSCR</p>
              <p className={`text-2xl font-bold ${
                result.dscr >= 1.25 ? 'text-[#10B981]' : result.dscr >= 1.0 ? 'text-orange-600' : 'text-red-600'
              }`}>
                {result.dscr.toFixed(2)}x
              </p>
            </div>
            <div className="text-center px-4 border-r border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('annualDebtService')}</p>
              <p className="text-xl font-semibold text-foreground">${result.annualDebtService.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('expectedRevenue')}</p>
              <p className="text-xl font-semibold text-foreground">${result.expectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg ${
            result.dscr >= 1.25
              ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'
              : result.dscr >= 1.0
              ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300'
              : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
          }`}>
            <span className="text-xs font-medium uppercase tracking-wide opacity-90">{t('creditRiskLabel')}</span>
            <span className="block font-medium">
              {result.dscr >= 1.25 ? t('creditworthy') : result.dscr >= 1.0 ? t('marginal') : t('highDefaultRisk')}
            </span>
          </div>
        </div>
      </Card>

      {/* 3x3 Metrics Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Row 1 */}
        <MetricCard
          title={t('predictedYield')}
          value={`${result.predictedYield.toFixed(1)} t/ha`}
          subtitle={`Yield anomaly p50: ${result.p50 > 0 ? '+' : ''}${result.p50.toFixed(1)}%`}
          icon={<Target className="w-5 h-5" />}
          color="primary"
        />
        <MetricCard
          title={t('yieldAnomaly')}
          value={`${result.yieldAnomaly > 0 ? '+' : ''}${result.yieldAnomaly.toFixed(1)}%`}
          subtitle={t('vs5YearAverage')}
          icon={result.yieldAnomaly < -10 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          color={result.yieldAnomaly < -10 ? 'red' : result.yieldAnomaly < 0 ? 'orange' : 'green'}
          highlight={result.yieldAnomaly < -10}
        />
        <MetricCard
          title={t('fieldRisk')}
          value={result.riskCategory === 'LOW' ? t('lowRisk') : result.riskCategory === 'MODERATE' ? t('moderateRisk') : t('highRisk')}
          subtitle={t('satelliteDerived')}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={result.riskCategory === 'HIGH' ? 'red' : result.riskCategory === 'MODERATE' ? 'orange' : 'green'}
          highlight={result.riskCategory === 'HIGH'}
        />

        {/* Row 2 */}
        <MetricCard
          title={t('trendDynamicsLabel')}
          value={result.trendDynamics === 'Declining' ? t('declining') : result.trendDynamics === 'Improving' ? t('improving') : t('stable')}
          subtitle={`NDVI slope: ${result.ndviSlope > 0 ? '+' : ''}${result.ndviSlope.toFixed(3)}`}
          icon={result.trendDynamics === 'Declining' ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          color={result.trendDynamics === 'Declining' ? 'orange' : 'green'}
        />
        <MetricCard
          title={t('climateStress')}
          value={`HTC ${result.htcIndex.toFixed(2)}`}
          subtitle={result.htcIndex < 0.7 ? t('droughtSignal') : t('normalLabel')}
          icon={<Thermometer className="w-5 h-5" />}
          color={result.htcIndex < 0.7 ? 'red' : 'green'}
          highlight={result.htcIndex < 0.7}
        />
        <MetricCard
          title={t('confidence')}
          value={`±${result.confidenceSpread.toFixed(1)}`}
          subtitle={`${t('anomalyRange')}: ${result.p10.toFixed(1)}% - ${result.p90.toFixed(1)}%`}
          icon={<Activity className="w-5 h-5" />}
          color="primary"
        />
      </div>

      {/* Evidence Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: NDVI Anomaly Timeline */}
        <Card className="p-4 lg:col-span-1">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">{t('ndviAnomalyTimeline')}</h3>
              <p className="text-xs text-muted-foreground">{t('detectionOfDroughtEvents')}</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData.ndviAnomalyTimeline.length ? chartData.ndviAnomalyTimeline : [{ year: new Date().getFullYear(), anomaly: 0, baseline: 0 }]} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" domain={[-25, 10]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="5 5" />
                  <ReferenceArea y1={-10} y2={-25} fill="#ef4444" fillOpacity={0.1} />
                  <Line
                    type="monotone"
                    dataKey="anomaly"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--primary)', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {t('redZoneIndicates')}
            </p>
          </div>
        </Card>

        {/* Chart 2: Risk Distribution Donut */}
        <Card className="p-4 lg:col-span-1">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">{t('riskDistribution')}</h3>
              <p className="text-xs text-muted-foreground">{t('districtLevelContext')}</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, 'Fields']}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {t('regionalPattern')}
            </p>
          </div>
        </Card>

        {/* Chart 3: Precip vs Vegetation Dual-Axis */}
        <Card className="p-4 lg:col-span-1">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">{t('precipVsVegetation')}</h3>
              <p className="text-xs text-muted-foreground">{t('multiModalValidation')}</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData.precipVsVegetation.length ? chartData.precipVsVegetation : [{ year: new Date().getFullYear(), precipitation: 0, ndvi: 0 }]} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis 
                    yAxisId="left" 
                    tick={{ fontSize: 11 }} 
                    stroke="#3b82f6"
                    domain={[0, 500]}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    tick={{ fontSize: 11 }} 
                    stroke="#10B981"
                    domain={[0, 1]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                  <Bar 
                    yAxisId="left" 
                    dataKey="precipitation" 
                    fill="#3b82f6" 
                    name="Precipitation (mm)" 
                    radius={[4, 4, 0, 0]}
                    fillOpacity={0.7}
                  />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="ndvi" 
                    stroke="#10B981" 
                    name="NDVI Index"
                    strokeWidth={2}
                    dot={{ fill: '#10B981', r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {t('rainVegetationCorrelation')}
            </p>
          </div>
        </Card>
      </div>

      {/* Add field to tracking — green button at bottom */}
      {onAddField && !fieldAdded && (
        <div className="pt-4">
          <Button
            onClick={() => {
              const crop = result.assetName?.split(' ')[0] || 'Cotton'
              const bounds = loanParams?.drawnArea?.bounds
              const coordinates = bounds
                ? `${((bounds.north + bounds.south) / 2).toFixed(4)}, ${((bounds.east + bounds.west) / 2).toFixed(4)}`
                : result.district
              addField({
                assetName: result.assetName,
                region: result.region,
                district: result.district,
                crop,
                coordinates,
                hectares: loanParams?.hectares,
                loanAmount: loanParams?.loanAmount,
                interestRate: loanParams?.interestRate,
                termYears: loanParams?.termYears,
                result: {
                  predictedYield: result.predictedYield,
                  yieldAnomaly: result.yieldAnomaly,
                  riskCategory: result.riskCategory,
                  trendDynamics: result.trendDynamics,
                  ndviSlope: result.ndviSlope,
                  htcIndex: result.htcIndex,
                  confidenceSpread: result.confidenceSpread,
                  p10: result.p10,
                  p50: result.p50,
                  p90: result.p90,
                  dscr: result.dscr,
                  annualDebtService: result.annualDebtService,
                  expectedRevenue: result.expectedRevenue,
                  aiTips: result.aiTips,
                },
              })
              setFieldAdded(true)
              onAddField()
            }}
            className="w-full py-6 text-lg font-semibold bg-[#10B981] text-white hover:bg-[#059669] shadow-lg hover:shadow-xl transition-all"
          >
            <MapPin className="w-5 h-5 mr-2" />
            {t('addFieldToTracking')}
          </Button>
        </div>
      )}
      {fieldAdded && (
        <p className="text-sm text-[#10B981] font-medium pt-2">{t('fieldAddedToTracking')}</p>
      )}
    </div>
  )
}

// Metric Card Component
interface MetricCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  color: 'primary' | 'green' | 'orange' | 'red'
  highlight?: boolean
}

function MetricCard({ title, value, subtitle, icon, color, highlight }: MetricCardProps) {
  const colorClasses = {
    primary: 'text-[#10B981]',
    green: 'text-[#10B981]',
    orange: 'text-orange-600 dark:text-orange-400',
    red: 'text-red-600 dark:text-red-400',
  }

  const bgClasses = {
    primary: 'bg-[#D1FAE5] dark:bg-[#10B981]/10',
    green: 'bg-[#D1FAE5] dark:bg-[#10B981]/10',
    orange: 'bg-orange-50 dark:bg-orange-950/30',
    red: 'bg-red-50 dark:bg-red-950/30',
  }

  return (
    <Card className={`p-4 border shadow-sm transition-all hover:shadow-md ${
      highlight ? `border-${color === 'red' ? 'red' : 'orange'}-300 dark:border-${color === 'red' ? 'red' : 'orange'}-800 ${bgClasses[color]}` : 'border-border/50'
    }`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <span className={colorClasses[color]}>{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${highlight ? colorClasses[color] : 'text-foreground'}`}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Card>
  )
}
