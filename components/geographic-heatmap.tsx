'use client'

import React from "react"

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/lib/language-context'

interface RegionData {
  id: string
  name: string
  riskCategory: 'High' | 'Biotic' | 'Normal'
  bioticStressIndex?: number
  yieldAnomaly: number
  coordinates?: [number, number][][]
}

interface TooltipData {
  region: string
  riskCategory: string
  yieldAnomaly: number
  year: string
  visible: boolean
  x: number
  y: number
}

const countryData = {
  uzbekistan: {
    center: [65.5, 41.5],
    zoom: 5,
    regions: [
      { id: 'uz_1', name: 'Tashkent Region', riskCategory: 'Normal' as const, yieldAnomaly: 2.1 },
      { id: 'uz_2', name: 'Bukhara Region', riskCategory: 'High' as const, yieldAnomaly: -5.2 },
      { id: 'uz_3', name: 'Navoi Region', riskCategory: 'High' as const, yieldAnomaly: -6.8 },
      { id: 'uz_4', name: 'Kashkadarya Region', riskCategory: 'Biotic' as const, yieldAnomaly: -3.5 },
      { id: 'uz_5', name: 'Samarkand Region', riskCategory: 'Normal' as const, yieldAnomaly: 1.2 },
      { id: 'uz_6', name: 'Fergana Region', riskCategory: 'High' as const, yieldAnomaly: -4.1 },
      { id: 'uz_7', name: 'Andijan Region', riskCategory: 'Biotic' as const, yieldAnomaly: -2.8 },
      { id: 'uz_8', name: 'Namangan Region', riskCategory: 'Normal' as const, yieldAnomaly: 0.9 },
    ],
  },
  tajikistan: {
    center: [71.5, 37.5],
    zoom: 5,
    regions: [
      { id: 'tj_1', name: 'Dushanbe', riskCategory: 'Normal' as const, yieldAnomaly: 1.5 },
      { id: 'tj_2', name: 'Hissar Valley', riskCategory: 'High' as const, yieldAnomaly: -4.2 },
      { id: 'tj_3', name: 'Khatlon', riskCategory: 'Biotic' as const, yieldAnomaly: -2.1 },
    ],
  },
  kazakhstan: {
    center: [68.0, 48.0],
    zoom: 4,
    regions: [
      { id: 'kz_1', name: 'Almaty Region', riskCategory: 'Normal' as const, yieldAnomaly: 0.8 },
      { id: 'kz_2', name: 'South Kazakhstan', riskCategory: 'High' as const, yieldAnomaly: -5.5 },
      { id: 'kz_3', name: 'Mangystau', riskCategory: 'Biotic' as const, yieldAnomaly: -1.9 },
    ],
  },
  kyrgyzstan: {
    center: [77.5, 42.5],
    zoom: 5,
    regions: [
      { id: 'kg_1', name: 'Bishkek', riskCategory: 'Normal' as const, yieldAnomaly: 1.2 },
      { id: 'kg_2', name: 'Chuy Valley', riskCategory: 'High' as const, yieldAnomaly: -3.8 },
      { id: 'kg_3', name: 'Issyk-Kul', riskCategory: 'Biotic' as const, yieldAnomaly: -0.5 },
    ],
  },
  turkmenistan: {
    center: [64.0, 38.5],
    zoom: 5,
    regions: [
      { id: 'tm_1', name: 'Ahal', riskCategory: 'High' as const, yieldAnomaly: -6.5 },
      { id: 'tm_2', name: 'Balkan', riskCategory: 'High' as const, yieldAnomaly: -5.8 },
      { id: 'tm_3', name: 'Dasoguz', riskCategory: 'Biotic' as const, yieldAnomaly: -2.3 },
    ],
  },
}

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

export function GeographicHeatmap() {
  const { t } = useLanguage()
  const [selectedCountry, setSelectedCountry] = useState('uzbekistan')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState('2024')
  const [tooltip, setTooltip] = useState<TooltipData>({
    region: '',
    riskCategory: '',
    yieldAnomaly: 0,
    year: '2024',
    visible: false,
    x: 0,
    y: 0,
  })

  const currentCountry = countryData[selectedCountry as keyof typeof countryData]
  const regions = currentCountry.regions

  const getRiskColor = (category: string) => {
    switch (category) {
      case 'High':
        return '#ef4444'
      case 'Biotic':
        return '#a855f7'
      case 'Normal':
        return '#10B981'
      default:
        return '#9ca3af'
    }
  }

  const handleRegionHover = (region: RegionData, e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    setTooltip({
      region: region.name,
      riskCategory: region.riskCategory,
      yieldAnomaly: region.yieldAnomaly,
      year: selectedYear,
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleRegionLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  const handleRegionClick = (regionId: string) => {
    setSelectedRegion(selectedRegion === regionId ? null : regionId)
  }

  // Create SVG paths for region boxes (simplified grid-based visualization)
  const createRegionPath = (index: number, cols: number = 3) => {
    const cellSize = 80
    const padding = 10
    const row = Math.floor(index / cols)
    const col = index % cols
    const x = col * (cellSize + padding)
    const y = row * (cellSize + padding)

    return {
      x,
      y,
      width: cellSize,
      height: cellSize,
    }
  }

  return (
    <Card className="w-full h-full border-border p-6 flex flex-col bg-gradient-to-br from-background to-muted/10">
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
          <Select value={selectedRegion || 'all'} onValueChange={(v) => setSelectedRegion(v === 'all' ? null : v)}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => (
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

      {/* Map Container */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-lg border border-border overflow-hidden relative">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        >
          {/* Country title background */}
          <rect width="800" height="40" fill="url(#bgGradient)" />
          <text x="20" y="25" fontSize="18" fontWeight="bold" fill="currentColor" className="text-foreground">
            {countries.find((c) => c.value === selectedCountry)?.label} - Risk Heatmap ({selectedYear})
          </text>

          {/* Gradient defs */}
          <defs>
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f3f4f6" stopOpacity="1" />
              <stop offset="100%" stopColor="#e5e7eb" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Region boxes (heatmap cells) */}
          {regions.map((region, index) => {
            const isSelected = selectedRegion === region.id
            const isVisible = !selectedRegion || isSelected
            const path = createRegionPath(index)
            const color = getRiskColor(region.riskCategory)

            return (
              <g key={region.id} opacity={isVisible ? 1 : 0.2} className="transition-opacity">
                {/* Main region rectangle */}
                <rect
                  x={path.x + 20}
                  y={path.y + 60}
                  width={path.width}
                  height={path.height}
                  fill={color}
                  stroke={isSelected ? '#000' : '#e5e7eb'}
                  strokeWidth={isSelected ? 3 : 1}
                  rx="4"
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => handleRegionClick(region.id)}
                  onMouseEnter={(e) => handleRegionHover(region, e)}
                  onMouseLeave={handleRegionLeave}
                />

                {/* Region label */}
                <text
                  x={path.x + 20 + path.width / 2}
                  y={path.y + 90}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="bold"
                  fill="white"
                  className="pointer-events-none select-none"
                >
                  {region.name.substring(0, 12)}
                </text>

                {/* Yield anomaly */}
                <text
                  x={path.x + 20 + path.width / 2}
                  y={path.y + 110}
                  textAnchor="middle"
                  fontSize="11"
                  fill="white"
                  className="pointer-events-none select-none"
                >
                  {region.yieldAnomaly > 0 ? '+' : ''}{region.yieldAnomaly}%
                </text>
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="absolute bg-slate-900 text-white px-3 py-2 rounded-lg text-xs shadow-lg z-10 pointer-events-none"
            style={{
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y + 10}px`,
            }}
          >
            <p className="font-semibold">{tooltip.region}</p>
            <p>Risk: {tooltip.riskCategory}</p>
            <p>Yield Anomaly: {tooltip.yieldAnomaly > 0 ? '+' : ''}{tooltip.yieldAnomaly}%</p>
            <p>Year: {tooltip.year}</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border flex gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-muted-foreground">High Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#a855f7' }} />
          <span className="text-muted-foreground">Biotic Stress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10B981' }} />
          <span className="text-muted-foreground">Normal</span>
        </div>
      </div>
    </Card>
  )
}
