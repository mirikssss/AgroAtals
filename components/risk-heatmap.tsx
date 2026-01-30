'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/lib/language-context'

interface Region {
  id: string
  name: string
  riskCategory: 'High' | 'Biotic' | 'Normal'
  bioticStressIndex?: number
  yieldAnomaly: number
  description: string
}

interface HeatmapProps {
  onRegionClick?: (region: Region) => void
}

// Mock data for Uzbekistan regions
const uzbekistanRegions: Region[] = [
  { id: 'uz_1', name: 'Tashkent Region', riskCategory: 'Normal', yieldAnomaly: 2.1, description: 'Stable conditions, normal yield trends' },
  { id: 'uz_2', name: 'Bukhara Region', riskCategory: 'High', yieldAnomaly: -5.2, description: 'High drought risk detected' },
  { id: 'uz_3', name: 'Navoi Region', riskCategory: 'High', yieldAnomaly: -6.8, description: 'Severe water stress observed' },
  { id: 'uz_4', name: 'Kashkadarya Region', riskCategory: 'Biotic', bioticStressIndex: 1.8, yieldAnomaly: -3.5, description: 'Pest pressure detected' },
  { id: 'uz_5', name: 'Samarkand Region', riskCategory: 'Normal', yieldAnomaly: 1.2, description: 'Conditions within normal range' },
  { id: 'uz_6', name: 'Fergana Region', riskCategory: 'High', yieldAnomaly: -4.1, description: 'Elevated risk from pest infestation' },
  { id: 'uz_7', name: 'Andijan Region', riskCategory: 'Biotic', bioticStressIndex: 1.6, yieldAnomaly: -2.8, description: 'Moderate biotic stress detected' },
  { id: 'uz_8', name: 'Namangan Region', riskCategory: 'Normal', yieldAnomaly: 0.9, description: 'Stable regional conditions' },
]

const countries = [
  { value: 'uzbekistan', label: 'Uzbekistan' },
  { value: 'tajikistan', label: 'Tajikistan' },
  { value: 'kazakhstan', label: 'Kazakhstan' },
  { value: 'kyrgyzstan', label: 'Kyrgyzstan' },
  { value: 'turkmenistan', label: 'Turkmenistan' },
]

const years = [
  { value: '2024', label: '2024 (Latest)' },
  { value: '2023', label: '2023' },
  { value: '2022', label: '2022' },
  { value: '2021', label: '2021' },
]

export function RiskHeatmap({ onRegionClick }: HeatmapProps) {
  const { t } = useLanguage()
  const [selectedCountry, setSelectedCountry] = useState('uzbekistan')
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [selectedYear, setSelectedYear] = useState('2024')
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)

  const getRiskColor = (region: Region) => {
    switch (region.riskCategory) {
      case 'High':
        return 'bg-red-500 hover:bg-red-600'
      case 'Biotic':
        return 'bg-purple-500 hover:bg-purple-600'
      case 'Normal':
        return 'bg-[#10B981] hover:bg-[#059669]'
      default:
        return 'bg-gray-300'
    }
  }

  const filteredRegions =
    selectedRegion === 'all'
      ? uzbekistanRegions
      : uzbekistanRegions.filter((r) => r.id === selectedRegion)

  const handleRegionClick = (region: Region) => {
    onRegionClick?.(region)
  }

  return (
    <Card className="w-full h-full border-border p-6 flex flex-col">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select Country</label>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {countries.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select Region</label>
          <Select value={selectedRegion} onValueChange={setSelectedRegion}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Regions</SelectItem>
              {uzbekistanRegions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Select Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {years.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Heatmap */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
        {filteredRegions.map((region) => (
          <div
            key={region.id}
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHoveredRegion(region.id)}
            onMouseLeave={() => setHoveredRegion(null)}
            onClick={() => handleRegionClick(region)}
          >
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              {/* Color indicator */}
              <div className={`w-4 h-4 rounded-full ${getRiskColor(region)}`} />

              {/* Region info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">{region.name}</p>
                <p className="text-xs text-muted-foreground">{region.description}</p>
              </div>

              {/* Risk badge */}
              <div className="text-right">
                <div className="text-xs font-semibold text-muted-foreground">
                  {region.riskCategory === 'High' && <span className="text-red-600">High</span>}
                  {region.riskCategory === 'Biotic' && <span className="text-purple-600">Biotic</span>}
                  {region.riskCategory === 'Normal' && <span className="text-[#10B981]">Normal</span>}
                </div>
                <p className={`text-xs font-medium ${region.yieldAnomaly < 0 ? 'text-red-600' : 'text-[#10B981]'}`}>
                  {region.yieldAnomaly > 0 ? '+' : ''}{region.yieldAnomaly}% yield
                </p>
              </div>
            </div>

            {/* Tooltip on hover */}
            {hoveredRegion === region.id && (
              <div className="ml-7 text-xs text-muted-foreground p-2 bg-muted rounded">
                Click to view details • Yield Anomaly: {region.yieldAnomaly}% • Year: {selectedYear}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border flex gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">High Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-muted-foreground">Biotic Stress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#10B981]" />
          <span className="text-muted-foreground">Normal</span>
        </div>
      </div>
    </Card>
  )
}
