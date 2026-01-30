'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'
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
  mockDistrictData,
  nationalAverageData,
  type DistrictRiskData,
} from '@/data/regions-data'

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
}

function KPICard({ title, value, icon, subtitle }: KPICardProps) {
  return (
    <Card className="p-4 bg-card border-border">
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
  const [selectedDistrictData, setSelectedDistrictData] = useState<DistrictRiskData>(nationalAverageData)
  const [displayName, setDisplayName] = useState<string>('National Average')
  
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
    setSelectedDistrictData(nationalAverageData)
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
    
    const data = mockDistrictData[districtName] || {
      riskScore: Math.random() * 0.6 + 0.2,
      valueAtRisk: `$${(Math.random() * 2 + 0.5).toFixed(1)}M`,
      yieldAnomaly: `${(Math.random() * 20 - 10).toFixed(1)}%`,
      aiInsight: `Analysis for ${districtName}. Satellite monitoring active.`
    }
    setSelectedDistrictData(data)
    setDisplayName(districtName)
  }, [])
  
  // Handle back to regions
  const handleBackToRegions = useCallback(() => {
    setSelectedRegion('all')
    setDistrictsGeoJSON(null)
    setSelectedDistrict(null)
    setSelectedDistrictData(nationalAverageData)
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
    setSelectedDistrictData(nationalAverageData)
    setDisplayName('National Average')
    setHoveredArea(null)
    setShouldFitBounds(true)
  }, [selectedCountry])

  // Current GeoJSON to display
  const currentGeoJSON = selectedRegion !== 'all' && districtsGeoJSON ? districtsGeoJSON : regionsGeoJSON
  const isShowingDistricts = selectedRegion !== 'all' && districtsGeoJSON !== null

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Filters Row - Above everything */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Country
          </label>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {centralAsianCountries.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
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
            <SelectTrigger className="bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Regions</SelectItem>
              {regionsList.map((region) => (
                <SelectItem key={region.name} value={region.name}>
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Year
          </label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {availableYears.map((year) => (
                <SelectItem key={year.value} value={year.value}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
          
          {/* Map Container */}
          <Card className="flex-1 h-[500px] overflow-hidden border-border relative">
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
        </div>
        
        {/* Right Side - KPI Cards */}
        <div className="flex flex-col gap-4 h-[500px]">
          {/* Selected Area Header */}
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {selectedDistrict ? 'Selected District' : 'Selected'}
                </p>
                <h2 className="text-base font-bold text-foreground truncate">{displayName}</h2>
              </div>
            </div>
          </Card>
          
          {/* KPI Card 1: Portfolio Value at Risk */}
          <KPICard
            title="Portfolio Value at Risk"
            value={selectedDistrictData.valueAtRisk}
            icon={<DollarSign className="w-4 h-4" />}
            subtitle={`Risk Score: ${(selectedDistrictData.riskScore * 100).toFixed(0)}%`}
          />
          
          {/* KPI Card 2: Yield Anomaly */}
          <KPICard
            title="Yield Anomaly Forecast"
            value={selectedDistrictData.yieldAnomaly}
            icon={<Wheat className="w-4 h-4" />}
            subtitle="Compared to 5-year average"
          />
          
          {/* KPI Card 3: AI Insights */}
          <Card className="p-4 bg-card border-border flex-1 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                AI Recommendation
              </h3>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Brain className="w-4 h-4" />
              </div>
            </div>
            <p className="text-sm text-foreground leading-relaxed flex-1">
              {selectedDistrictData.aiInsight}
            </p>
          </Card>
          
          {/* Year indicator */}
          <div className="p-2 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">
              Data: <span className="font-semibold text-foreground">
                {selectedYear === 'current' ? '2025' : selectedYear}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
