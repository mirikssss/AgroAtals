'use client'

import { Input } from "@/components/ui/input"
import React from "react"
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, Gauge, MapPin, Satellite, BarChart3, Download, Settings, AlertCircle, CheckCircle, Plus, Target, Thermometer, Activity, ChevronRight, ChevronLeft } from 'lucide-react'
import { CentralAsiaMap } from '@/components/central-asia-map'
import { ProfilePopup } from '@/components/profile-popup'
import { InteractiveRiskMap } from '@/components/interactive-risk-map'
import { DashboardKPI } from '@/components/dashboard-kpi'
import { GeographicHeatmap } from '@/components/geographic-heatmap'
import { AnalyticsModule } from '@/components/analytics-module'
import { getFields, getFieldById, removeField, type SavedFieldMetadata } from '@/lib/fields-db'

const sampleNDVIData = [
  { month: 'Jan', ndvi: 0.3, expected: 0.35 },
  { month: 'Feb', ndvi: 0.42, expected: 0.45 },
  { month: 'Mar', ndvi: 0.55, expected: 0.58 },
  { month: 'Apr', ndvi: 0.68, expected: 0.65 },
  { month: 'May', ndvi: 0.75, expected: 0.74 },
  { month: 'Jun', ndvi: 0.78, expected: 0.76 },
  { month: 'Jul', ndvi: 0.72, expected: 0.77 },
]

const sampleYieldData = [
  { year: '2019', yield: 45 },
  { year: '2020', yield: 48 },
  { year: '2021', yield: 52 },
  { year: '2022', yield: 50 },
  { year: '2023', yield: 55 },
  { year: '2024', yield: 53 },
]

const sampleAssets = [
  { id: 'A001', name: 'Asset 001', crop: 'Wheat', location: 'Punjab, India', risk: 'Low', confidence: 92, lastAnalysis: '2024-01-15' },
  { id: 'A002', name: 'Asset 002', crop: 'Cotton', location: 'Sindh, Pakistan', risk: 'Moderate', confidence: 85, lastAnalysis: '2024-01-14' },
  { id: 'A003', name: 'Asset 003', crop: 'Rice', location: 'Andhra Pradesh, India', risk: 'High', confidence: 78, lastAnalysis: '2024-01-10' },
  { id: 'A004', name: 'Asset 004', crop: 'Cotton', location: 'Kunduz, Tajikistan', risk: 'Low', confidence: 88, lastAnalysis: '2024-01-12' },
]

const portfolioStats = {
  totalAssets: 4,
  cropsDistribution: { Wheat: 1, Cotton: 2, Rice: 1 },
  avgYieldAnomaly: -2.1,
  assetsAtHighRisk: 1,
  lastUpdate: '2024-01-15 14:32 UTC',
}

const alerts = [
  { id: 1, type: 'drought', field: 'Andhra Pradesh, India', message: 'District X crossed drought threshold. Crop failure probability: 32%', severity: 'high' },
  { id: 2, type: 'yield', field: 'Sindh, Pakistan', message: 'Yield anomaly detected: -4.2% vs 5-year average. NDVI trending below baseline', severity: 'medium' },
  { id: 3, type: 'health', field: 'Punjab, India', message: 'NDVI peaked early → early harvest expected. Monitor maturity dates.', severity: 'low' },
]

const sampleFields = [
  { id: 'F001', location: 'Kunduz, Tajikistan', crop: 'Cotton', risk: 'Moderate', lastAnalysis: '2024-01-15', coordinates: '36.7372, 69.2081' },
  { id: 'F002', location: 'Punjab, India', crop: 'Wheat', risk: 'Low', lastAnalysis: '2024-01-14', coordinates: '31.5497, 74.3436' },
  { id: 'F003', location: 'Sindh, Pakistan', crop: 'Cotton', risk: 'Moderate', lastAnalysis: '2024-01-10', coordinates: '25.8943, 68.5247' },
  { id: 'F004', location: 'Andhra Pradesh, India', crop: 'Rice', risk: 'High', lastAnalysis: '2024-01-12', coordinates: '15.9129, 79.7400' },
]

function DashboardOverview() {
  return (
    <div className="w-full h-full min-h-0">
      {/* Карта на весь экран; KPI карточки закомментированы в InteractiveRiskMap */}
      <InteractiveRiskMap />
    </div>
  )
}

function PortfolioSection() {
  const { t } = useLanguage()
  const [filterCrop, setFilterCrop] = useState('')
  const [filterRisk, setFilterRisk] = useState('')
  const [csvUploadMode, setCsvUploadMode] = useState(false)

  const filteredAssets = sampleAssets.filter(
    (asset) =>
      (filterRisk === 'all' || asset.risk.toLowerCase() === filterRisk) &&
      (filterCrop === 'all' || asset.crop.toLowerCase() === filterCrop),
  )

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[v0] CSV file uploaded:', file.name)
      setCsvUploadMode(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t('assetPortfolio')}</h2>
        <p className="text-sm text-muted-foreground">{t('assetPortfolioDesc')}</p>
      </div>
      <Button 
        onClick={() => setCsvUploadMode(!csvUploadMode)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
      >
        <Download className="w-4 h-4" />
        Import CSV
      </Button>

      {/* CSV Upload Mode */}
      {csvUploadMode && (
        <Card className="bg-background border-border p-6 border-primary/50">
          <h3 className="text-lg font-semibold text-foreground mb-4">Import Assets from CSV</h3>
          <p className="text-sm text-muted-foreground mb-4">Expected columns: Region, Crop, Exposure (USD), Maturity Date (optional)</p>
          <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <p className="text-foreground font-medium">Click to upload CSV</p>
              <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
            </label>
          </div>
          <Button 
            onClick={() => setCsvUploadMode(false)}
            variant="outline"
            className="mt-4 w-full"
          >
            Cancel
          </Button>
        </Card>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">{t('filterByRiskLevel')}</label>
          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">{t('filterByCropType')}</label>
          <Select value={filterCrop} onValueChange={setFilterCrop}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">{t('allCrops')}</SelectItem>
              <SelectItem value="wheat">Wheat</SelectItem>
              <SelectItem value="corn">Corn</SelectItem>
              <SelectItem value="rice">Rice</SelectItem>
              <SelectItem value="cotton">Cotton</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssets.map((field, idx) => (
            <Card key={field.id} className="bg-background border-border p-6 hover:border-primary/50 transition">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{field.location}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{field.crop}</p>
                </div>
                <Badge
                  className={
                    field.risk === 'Low'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                      : field.risk === 'Moderate'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  }
                >
                  {field.risk} Risk
                </Badge>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Exposure</span>
                  <span className="font-mono text-foreground font-semibold">${(300 + idx * 50).toLocaleString()}K</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Yield Anomaly</span>
                  <div className="flex items-center gap-1">
                    {field.risk === 'High' ? (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-[#10B981]" />
                    )}
                    <span className="font-mono text-foreground">{field.risk === 'High' ? '-5.2' : '-2.1'}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">District Level</span>
                  <span className="text-foreground font-medium">Admin-2</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Analysis Date</span>
                  <span className="text-foreground text-xs">{field.lastAnalysis}</span>
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full border-border text-primary hover:bg-primary/10 bg-transparent">
                View Details
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border p-12 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground mb-2">{t('noAssetsMatch')}</p>
          <p className="text-sm text-muted-foreground">{t('createFirstAsset')}</p>
        </Card>
      )}
    </div>
  )
}

function AnalyticsSection() {
  const { t } = useLanguage()
  const [lat, setLat] = useState('36.7372')
  const [lon, setLon] = useState('69.2081')
  const [crop, setCrop] = useState('cotton')
  const [season, setSeason] = useState('2024')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [assetAdded, setAssetAdded] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [mapClicked, setMapClicked] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState('')

  const districtMap: Record<string, string> = {
    '36.7372,69.2081': 'Kunduz District, Tajikistan',
    '31.5497,74.3436': 'Lahore District, Pakistan',
    '28.6139,77.2090': 'Delhi District, India',
    '23.1815,79.9864': 'Indore District, India',
  }

  const handleMapClick = () => {
    setMapClicked(true)
    setTimeout(() => setMapClicked(false), 2000)
  }

  const handleLocationSelect = (selectedLat: string, selectedLon: string, location: string) => {
    setLat(selectedLat)
    setLon(selectedLon)
    setSelectedLocation(location)
    setShowMap(false)
    console.log('[v0] Location selected:', location, selectedLat, selectedLon)
  }

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsAnalyzing(false)
    const key = `${lat},${lon}`
    const district = districtMap[key] || `Location at ${lat}, ${lon}`
    setAnalysisResult({
      district,
      region: 'South Asia',
      riskCategory: 'Moderate',
      yieldAnomaly: -2.4,
      p50: 1850,
      p10: 1420,
      recommendation: 'Regional drought risk: 35%. Crop failure probability: 18%. Monitor precipitation patterns.',
    })
    setAnalysisComplete(true)
  }

  const handleAddAsset = async () => {
    setAssetAdded(true)
    setTimeout(() => {
      setAnalysisComplete(false)
      setAssetAdded(false)
      setLat('36.7372')
      setLon('69.2081')
      setCrop('cotton')
      setAnalysisResult(null)
    }, 1500)
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h3 className="text-2xl font-bold text-foreground">{t('analytics')}</h3>
        <p className="text-sm text-muted-foreground mt-2">Analyze regional risk and add assets to your portfolio</p>
      </div>

      {/* Map Selector Toggle */}
      {!showMap && (
        <Button 
          onClick={() => setShowMap(true)}
          className="w-full bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 py-5 font-semibold rounded-lg mb-2 transition-all"
        >
          <MapPin className="w-4 h-4 mr-2" />
          {t('openInteractiveMap')}
        </Button>
      )}

      {/* Interactive Map Section */}
      {showMap && (
        <Card className="bg-background border border-border/50 shadow-md p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Select Location from Map</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose a country, region, and optional subregion</p>
            </div>
            <Button 
              onClick={() => setShowMap(false)}
              variant="outline"
              className="text-sm"
            >
              Close Map
            </Button>
          </div>
          <CentralAsiaMap onLocationSelect={handleLocationSelect} />
        </Card>
      )}

      {/* Location & Asset Details Input - Primary Focus */}
      <Card className="bg-background border border-border/50 shadow-sm hover:shadow-md transition-shadow p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-foreground">{t('locationAssetDetails')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedLocation ? `${t('selected')}: ${selectedLocation}` : t('enterCoordinates')}
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs font-semibold text-primary">Step 1</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t('latitude')}</label>
            <Input
              type="number"
              step="0.0001"
              placeholder="36.7372"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="bg-input/50 border-border text-foreground focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t('longitude')}</label>
            <Input
              type="number"
              step="0.0001"
              placeholder="69.2081"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="bg-input/50 border-border text-foreground focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t('cropType')}</label>
            <Select value={crop} onValueChange={setCrop}>
              <SelectTrigger className="bg-input/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="wheat">Wheat</SelectItem>
                <SelectItem value="corn">Corn</SelectItem>
                <SelectItem value="rice">Rice</SelectItem>
                <SelectItem value="cotton">Cotton</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t('season')}</label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="bg-input/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="2024">Current (2024)</SelectItem>
                <SelectItem value="2023">Historical (2023)</SelectItem>
                <SelectItem value="2022">Historical (2022)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing || !lat || !lon}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-6 font-semibold rounded-lg text-base shadow-sm hover:shadow-md transition-all"
        >
          {isAnalyzing ? t('analyzing') : t('analyze')}
        </Button>
      </Card>

      {/* Analysis Results & Interactive Map Grid */}
      {analysisComplete && analysisResult && (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Results Summary */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/0 border border-primary/20 shadow-sm p-8 lg:col-span-1">
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-xl font-semibold text-foreground">Analysis Results</h3>
              <div className="px-3 py-1 rounded-full bg-[#10B981]/10 border border-[#10B981]/20">
                <span className="text-xs font-semibold text-[#10B981]">Complete</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">District</p>
                <p className="font-semibold text-foreground text-sm">{analysisResult.district}</p>
              </div>

              <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Risk Level</p>
                <Badge className="mt-1 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                  {analysisResult.riskCategory}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Yield Anomaly</p>
                  <p className="font-mono text-foreground font-semibold text-sm">{analysisResult.yieldAnomaly}%</p>
                </div>
                <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-1">p50 Yield</p>
                  <p className="font-mono text-foreground font-semibold text-sm">{analysisResult.p50}</p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/50 rounded-lg p-4 mt-4">
                <p className="text-xs font-semibold text-foreground mb-2">AI Recommendation</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{analysisResult.recommendation}</p>
              </div>

              <Button
                onClick={handleAddAsset}
                disabled={assetAdded}
                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 py-5 mt-6 rounded-lg font-semibold shadow-sm hover:shadow-md transition-all"
              >
                {assetAdded ? '✓ Saved to Portfolio' : 'Add to Portfolio'}
              </Button>
            </div>
          </Card>

          {/* Right: Interactive Map */}
          <Card className="lg:col-span-2 border border-border/50 shadow-sm overflow-hidden bg-background p-0">
            <div 
              onClick={handleMapClick}
              className="h-96 flex items-center justify-center relative overflow-hidden cursor-pointer hover:bg-primary/3 transition bg-gradient-to-br from-primary/3 to-secondary/3"
            >
              <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(90, 140, 79, 0.1) 0%, transparent 50%)'}} />
              <div className="relative text-center space-y-4 z-10">
                <MapPin className="w-16 h-16 text-primary mx-auto opacity-50" />
                <div>
                  <p className="text-foreground font-semibold">
                    {mapClicked ? 'Location Confirmed' : 'Interactive Map View'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {mapClicked ? '✓ Pin placed on map' : 'Location: ' + lat + ', ' + lon}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Initial State - Map Placeholder */}
      {!analysisComplete && (
        <Card className="border border-border/50 shadow-sm overflow-hidden bg-background p-0">
          <div 
            onClick={handleMapClick}
            className="h-96 flex items-center justify-center relative overflow-hidden cursor-pointer hover:bg-primary/3 transition bg-gradient-to-br from-primary/3 to-secondary/3"
          >
            <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(90, 140, 79, 0.1) 0%, transparent 50%)'}} />
            <div className="relative text-center space-y-4 z-10">
              <MapPin className="w-16 h-16 text-primary mx-auto opacity-50" />
              <div>
                <p className="text-foreground font-semibold">Interactive Map</p>
                <p className="text-sm text-muted-foreground mt-2">Click here or run analysis above to view location on map</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

const DASHBOARD_API_URL = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:8000'

interface ChartDataState {
  ndviAnomalyTimeline: Array<{ year: number; anomaly: number; baseline?: number }>
  riskDistribution: Array<{ name: string; value: number; color: string }>
  precipVsVegetation: Array<{ year: number; precipitation: number; ndvi: number }>
}

function FieldDetailView({ field, onBack }: { field: SavedFieldMetadata; onBack: () => void }) {
  const { t } = useLanguage()
  const [chartData, setChartData] = useState<ChartDataState>({
    ndviAnomalyTimeline: [],
    riskDistribution: [],
    precipVsVegetation: [],
  })

  useEffect(() => {
    const url = new URL('/dashboard/chart-data', DASHBOARD_API_URL)
    url.searchParams.set('country', 'UZB')
    url.searchParams.set('crop', field.crop.toLowerCase())
    if (field.district?.trim()) {
      url.searchParams.set('scope', 'district')
      url.searchParams.set('area_name', field.district.trim())
    } else if (field.region?.trim()) {
      url.searchParams.set('scope', 'region')
      url.searchParams.set('area_name', field.region.trim())
    } else {
      url.searchParams.set('scope', 'country')
    }
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setChartData)
      .catch(() => setChartData({ ndviAnomalyTimeline: [], riskDistribution: [], precipVsVegetation: [] }))
  }, [field.crop, field.district, field.region])

  const r = field.result
  const riskLabel = r.riskCategory === 'LOW' ? t('lowRisk') : r.riskCategory === 'MODERATE' ? t('moderateRisk') : t('highRisk')
  const anomalyValues = chartData.ndviAnomalyTimeline
    .map((p) => Number(p.anomaly))
    .filter((v) => Number.isFinite(v))
  const anomalyMin = anomalyValues.length ? Math.min(...anomalyValues) : -10
  const anomalyMax = anomalyValues.length ? Math.max(...anomalyValues) : 10
  const anomalySpan = Math.max(1, anomalyMax - anomalyMin)
  const anomalyPad = Math.max(2, anomalySpan * 0.2)
  const anomalyDomain: [number, number] = [
    Math.floor(Math.min(0, anomalyMin) - anomalyPad),
    Math.ceil(Math.max(0, anomalyMax) + anomalyPad),
  ]
  const scenarioBandData = [
    { name: 'P10', value: r.p10, color: '#ef4444' },
    { name: 'P50', value: r.p50, color: '#f59e0b' },
    { name: 'P90', value: r.p90, color: '#10B981' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <span>←</span> {t('back')}
        </Button>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">{field.assetName}</h2>
        <p className="text-muted-foreground">{field.region} • {field.district}</p>
      </div>

      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/0 border-primary/20">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-stretch flex-wrap gap-2 sm:gap-4">
            <div className="text-center px-3 sm:px-4 border-b sm:border-b-0 sm:border-r border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">DSCR</p>
              <p className={`text-2xl font-bold ${r.dscr >= 1.25 ? 'text-[#10B981]' : r.dscr >= 1.0 ? 'text-orange-600' : 'text-red-600'}`}>
                {r.dscr.toFixed(2)}x
              </p>
            </div>
            <div className="text-center px-3 sm:px-4 border-b sm:border-b-0 sm:border-r border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('annualDebtService')}</p>
              <p className="text-xl font-semibold text-foreground">${r.annualDebtService.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="text-center px-3 sm:px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('expectedRevenue')}</p>
              <p className="text-xl font-semibold text-foreground">${r.expectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg w-full sm:w-auto ${r.dscr >= 1.25 ? 'bg-green-100 dark:bg-green-950/50' : r.dscr >= 1.0 ? 'bg-orange-100 dark:bg-orange-950/50' : 'bg-red-100 dark:bg-red-950/50'}`}>
            <span className="text-xs font-medium uppercase opacity-90">{t('creditRiskLabel')}</span>
            <span className="block font-medium">
              {r.dscr >= 1.25 ? t('creditworthy') : r.dscr >= 1.0 ? t('marginal') : t('highDefaultRisk')}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card className="p-4 border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">{t('predictedYield')}</span>
            <Target className="w-5 h-5 text-[#10B981]" />
          </div>
          <p className="text-2xl font-bold text-foreground">{r.predictedYield.toFixed(1)} t/ha</p>
          <p className="text-xs text-muted-foreground">{t('vs5YearAverage')}: {r.p50 > 0 ? '+' : ''}{r.p50.toFixed(1)}%</p>
        </Card>
        <Card className="p-4 border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">{t('yieldAnomaly')}</span>
            {r.yieldAnomaly < -10 ? <TrendingDown className="w-5 h-5 text-red-600" /> : <TrendingUp className="w-5 h-5 text-[#10B981]" />}
          </div>
          <p className="text-2xl font-bold">{r.yieldAnomaly > 0 ? '+' : ''}{r.yieldAnomaly.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">{t('satelliteDerived')}</p>
        </Card>
        <Card className="p-4 border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">{t('fieldRisk')}</span>
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-foreground">{riskLabel}</p>
          <p className="text-xs text-muted-foreground">{t('satelliteDerived')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-2">{t('ndviAnomalyTimeline')}</h3>
          <div className="h-64">
            {chartData.ndviAnomalyTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData.ndviAnomalyTimeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={anomalyDomain} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('yieldAnomaly')]}
                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="anomaly" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('noData')}</div>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-2">{t('yieldScenarioBand')}</h3>
          <p className="text-xs text-muted-foreground mb-2">{t('bankingScenarioSubtitle')}</p>
          <div className="h-64">
            {scenarioBandData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBandData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('yieldAnomaly')]} contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="5 5" />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {scenarioBandData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('noData')}</div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">{t('scenarioBandFootnote')}</p>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-2">{t('precipVsVegetation')}</h3>
          <div className="h-64">
            {chartData.precipVsVegetation.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData.precipVsVegetation} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#3b82f6" domain={[0, 500]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#10B981" domain={[0, 1]} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                  <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                  <Bar yAxisId="left" dataKey="precipitation" fill="#3b82f6" name="Precipitation (mm)" radius={[4, 4, 0, 0]} fillOpacity={0.7} />
                  <Line yAxisId="right" type="monotone" dataKey="ndvi" stroke="#10B981" name="NDVI Index" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('noData')}</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function FieldsSection() {
  const { t } = useLanguage()
  const [fields, setFields] = useState<SavedFieldMetadata[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  const refreshFields = useCallback(() => {
    setFields(getFields())
  }, [])

  useEffect(() => {
    if (selectedFieldId === null) refreshFields()
  }, [selectedFieldId, refreshFields])

  const selectedField = selectedFieldId ? getFieldById(selectedFieldId) : null

  if (selectedField) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{t('yourFields')}</h2>
          <p className="text-sm text-muted-foreground mt-2">{t('analyzedLocations')}</p>
        </div>
        <FieldDetailView field={selectedField} onBack={() => setSelectedFieldId(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{t('yourFields')}</h2>
        <p className="text-sm text-muted-foreground mt-2">{t('analyzedLocations')}</p>
      </div>
      {fields.length === 0 ? (
        <Card className="border-border p-12 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground mb-2">{t('noAssetsMatch')}</p>
          <p className="text-sm text-muted-foreground">{t('createFirstAsset')}</p>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-foreground">{t('location')}</th>
                <th className="text-left p-3 font-medium text-foreground">{t('crop')}</th>
                <th className="text-left p-3 font-medium text-foreground">{t('riskLevel')}</th>
                <th className="text-left p-3 font-medium text-foreground">{t('lastUpdate')}</th>
                <th className="text-right p-3 font-medium text-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3">
                    <p className="font-medium text-foreground">{field.district}</p>
                    {field.coordinates && <p className="text-xs text-muted-foreground">{field.coordinates}</p>}
                  </td>
                  <td className="p-3 text-foreground">{field.crop}</td>
                  <td className="p-3">
                    <Badge className={field.result.riskCategory === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : field.result.riskCategory === 'MODERATE' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'}>
                      {field.result.riskCategory === 'LOW' ? t('lowRisk') : field.result.riskCategory === 'MODERATE' ? t('moderateRisk') : t('highRisk')}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(field.addedAt).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <Button variant="outline" size="sm" className="mr-2" onClick={() => setSelectedFieldId(field.id)}>
                      {t('viewResults')}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => { removeField(field.id); refreshFields(); }}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const SIDEBAR_COLLAPSED_W = 72
const SIDEBAR_EXPANDED_W = 280

const navItems: { id: string; icon: React.ComponentType<{ className?: string }>; labelKey: string }[] = [
  { id: 'dashboard', icon: BarChart3, labelKey: 'dashboard' },
  { id: 'portfolio', icon: Target, labelKey: 'portfolio' },
  { id: 'analytics', icon: Activity, labelKey: 'analytics' },
  { id: 'fields', icon: MapPin, labelKey: 'fields' },
]

export function Dashboard({ onNavigateToLanding }: { onNavigateToLanding?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { user, logout } = useAuth()
  const { t } = useLanguage()

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const sidebarW = sidebarExpanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W

  return (
    <div className="min-h-screen md:h-screen flex bg-background md:overflow-hidden">
      {/* Боковая панель: прозрачность через rgb(.../0.3), не сплошной белый */}
      <aside
        className="hidden md:fixed md:top-0 md:left-0 md:h-full md:z-50 md:flex md:flex-col backdrop-blur-md border-r border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5 transition-[width] duration-200 ease-out overflow-hidden bg-[rgb(255_255_255/0.3)] dark:bg-[rgb(15_23_42/0.4)]"
        style={{ width: sidebarW }}
      >
        {/* Логотип: по центру в свёрнутом виде */}
        <div
          className={`flex items-center shrink-0 h-14 border-b border-white/40 dark:border-slate-600/40 ${sidebarExpanded ? 'justify-start px-3' : 'justify-center px-0'}`}
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <Satellite className="w-5 h-5 text-white" />
          </div>
          {sidebarExpanded && (
            <span className="ml-3 text-lg font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">AgroRisk</span>
          )}
        </div>

        {/* Навигация: иконки всегда, подписи при раскрытии */}
        <nav className="flex-1 p-2 space-y-1 overflow-auto min-h-0">
          {navItems.map(({ id, icon: Icon, labelKey }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                title={!sidebarExpanded ? t(labelKey) : undefined}
                className={`
                  w-full flex items-center rounded-xl font-medium transition-colors
                  ${sidebarExpanded ? 'gap-3 px-4 py-3 text-left' : 'justify-center p-3'}
                  ${isActive
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
                  }
                `}
              >
                <Icon className="w-6 h-6 shrink-0" />
                {sidebarExpanded && <span className="whitespace-nowrap">{t(labelKey)}</span>}
              </button>
            )
          })}
        </nav>

        {/* Низ: только профиль и кнопка раскрытия */}
        <div className="shrink-0 p-2 border-t border-white/40 dark:border-slate-600/40 space-y-1">
          <div className={sidebarExpanded ? 'pt-1' : ''}>
            <ProfilePopup
              user={{
                name: user?.name || user?.email.split('@')[0] || 'User',
                email: user?.email || '',
                organization: 'AgroRisk',
                role: 'Risk Analyst'
              }}
              onLogout={() => {
                setSidebarExpanded(false)
                logout()
              }}
              showLabel={sidebarExpanded}
              triggerClassName={
                sidebarExpanded
                  ? 'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors font-medium'
                  : 'w-full flex justify-center p-3 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors'
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setSidebarExpanded((e) => !e)}
            className="w-full flex items-center rounded-xl font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
            aria-label={sidebarExpanded ? 'Свернуть меню' : 'Раскрыть меню'}
            title={sidebarExpanded ? 'Свернуть меню' : 'Раскрыть меню'}
          >
            {sidebarExpanded ? (
              <>
                <ChevronLeft className="w-6 h-6 shrink-0" />
                <span className="ml-1 whitespace-nowrap text-sm">Свернуть</span>
              </>
            ) : (
              <ChevronRight className="w-6 h-6 shrink-0 mx-auto" />
            )}
          </button>
        </div>
      </aside>

      {/* Контент: отступ слева = ширина панели. Для вкладок кроме dashboard — скролл и отступы. */}
      <main
        className="relative z-0 flex-1 min-h-0 min-w-0 overflow-hidden transition-[margin-left] duration-200 ease-out flex flex-col pb-20 md:pb-0"
        style={{ marginLeft: isMobile ? 0 : sidebarW }}
      >
        {isMobile && (
          <div className="fixed top-3 right-3 z-[60]">
            <ProfilePopup
              user={{
                name: user?.name || user?.email.split('@')[0] || 'User',
                email: user?.email || '',
                organization: 'AgroRisk',
                role: 'Risk Analyst',
              }}
              onLogout={logout}
              triggerClassName="rounded-full bg-background/80 backdrop-blur border border-border/60 p-1 shadow-md transition-all hover:shadow-lg hover:scale-105"
            />
          </div>
        )}
        {activeTab === 'dashboard' && <DashboardOverview />}
        {(activeTab === 'portfolio' || activeTab === 'analytics' || activeTab === 'fields') && (
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-6 lg:p-8">
            {activeTab === 'portfolio' && <PortfolioSection />}
            {activeTab === 'analytics' && <AnalyticsModule onFieldAdded={() => setActiveTab('fields')} />}
            {activeTab === 'fields' && <FieldsSection />}
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[70] border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {navItems.map(({ id, icon: Icon, labelKey }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center justify-center rounded-lg py-2 text-[11px] transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary scale-[1.02]'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span>{t(labelKey)}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
