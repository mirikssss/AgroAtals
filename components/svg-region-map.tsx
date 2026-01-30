'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'

interface RegionRiskData {
  [region: string]: {
    risk: 'high' | 'medium' | 'low'
    yieldAnomaly: number
    details: string
  }
}

const countryMaps: { [key: string]: { name: string; path: string } } = {
  uzbekistan: { name: 'Uzbekistan', path: '/maps/uzbekistan.svg' },
  tajikistan: { name: 'Tajikistan', path: '/maps/tajikistan.svg' },
  kyrgyzstan: { name: 'Kyrgyzstan', path: '/maps/kyrgyzstan.svg' },
  turkmenistan: { name: 'Turkmenistan', path: '/maps/turkmenistan.svg' },
  kazakhstan: { name: 'Kazakhstan', path: '/maps/kazakhstan.svg' },
}

const regionRiskData: { [country: string]: RegionRiskData } = {
  uzbekistan: {
    UZSU: { risk: 'high', yieldAnomaly: -4.2, details: 'Surkhandarya - Drought stress' },
    UZBE: { risk: 'medium', yieldAnomaly: -1.8, details: 'Bukhara - Moderate anomaly' },
    UZKA: { risk: 'medium', yieldAnomaly: -2.1, details: 'Kashkadarya - Biotic stress' },
    UZSA: { risk: 'low', yieldAnomaly: 0.5, details: 'Samarkand - Normal growth' },
    UZTA: { risk: 'low', yieldAnomaly: 0.2, details: 'Tashkent - Stable' },
    UZFI: { risk: 'medium', yieldAnomaly: -1.5, details: 'Fergana - Minor stress' },
    UZNA: { risk: 'high', yieldAnomaly: -3.8, details: 'Navoi - High risk' },
  },
  tajikistan: {
    TJGB: { risk: 'high', yieldAnomaly: -5.2, details: 'Gorno-Badakhshan - Mountain stress' },
    TJKH: { risk: 'medium', yieldAnomaly: -2.5, details: 'Khatlon - Moderate anomaly' },
    TJSM: { risk: 'medium', yieldAnomaly: -1.9, details: 'Sughd - Biotic stress' },
    TJCT: { risk: 'low', yieldAnomaly: 0.3, details: 'Dushanbe - Urban area' },
  },
  kyrgyzstan: {
    KGCH: { risk: 'high', yieldAnomaly: -4.8, details: 'Chuy - High altitude stress' },
    KGIS: { risk: 'medium', yieldAnomaly: -2.3, details: 'Issyk-Kul - Mountain region' },
    KGNA: { risk: 'medium', yieldAnomaly: -1.7, details: 'Naryn - Cold stress' },
    KGOS: { risk: 'low', yieldAnomaly: 0.4, details: 'Osh - Moderate conditions' },
  },
  turkmenistan: {
    TMAA: { risk: 'high', yieldAnomaly: -5.5, details: 'Ahal - Severe drought' },
    TMBA: { risk: 'high', yieldAnomaly: -4.9, details: 'Balkan - High stress' },
    TMDA: { risk: 'medium', yieldAnomaly: -2.1, details: 'Dasoguz - Moderate anomaly' },
    TMAS: { risk: 'low', yieldAnomaly: 0.5, details: 'Ashgabat - Capital' },
  },
  kazakhstan: {
    KZAK: { risk: 'high', yieldAnomaly: -4.5, details: 'Aktubinsk - Drought region' },
    KZAT: { risk: 'high', yieldAnomaly: -4.2, details: 'Atyrau - Arid region' },
    KZKA: { risk: 'medium', yieldAnomaly: -2.0, details: 'Karaganda - Moderate' },
    KZKZ: { risk: 'low', yieldAnomaly: 0.3, details: 'West Kazakhs - Stable' },
    KZMA: { risk: 'medium', yieldAnomaly: -1.8, details: 'Mangystau - Water stress' },
  },
}

export function SVGRegionMap() {
  const [selectedCountry, setSelectedCountry] = useState('uzbekistan')
  const [svgContent, setSvgContent] = useState<string>('')
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  useEffect(() => {
    const fetchSVG = async () => {
      try {
        const response = await fetch(countryMaps[selectedCountry].path)
        const content = await response.text()
        setSvgContent(content)
      } catch (error) {
        console.error('Error loading SVG:', error)
      }
    }

    fetchSVG()
  }, [selectedCountry])

  const getRiskColor = (risk: 'high' | 'medium' | 'low') => {
    switch (risk) {
      case 'high':
        return '#ef4444' // red
      case 'medium':
        return '#f97316' // orange
      case 'low':
        return '#10B981' // brand green
    }
  }

  const handleRegionClick = (regionId: string) => {
    setSelectedRegion(selectedRegion === regionId ? null : regionId)
  }

  const currentRiskData = regionRiskData[selectedCountry]
  const selectedRegionData = selectedRegion ? currentRiskData[selectedRegion] : null

  return (
    <Card className="w-full h-full p-6 bg-background border border-border">
      <div className="space-y-4">
        {/* Country Selector */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-muted-foreground min-w-fit">Select Country:</label>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(countryMaps).map(([key, { name }]) => (
                <SelectItem key={key} value={key}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Map Container */}
        <div className="w-full h-[500px] bg-muted rounded-lg border border-border flex items-center justify-center overflow-auto">
          {svgContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: svgContent }}
              className="w-full h-full [&_svg]:w-full [&_svg]:h-full"
              onMouseMove={(e) => {
                const target = e.target as SVGPathElement
                if (target.id) {
                  setHoveredRegion(target.id)
                }
              }}
              onMouseLeave={() => setHoveredRegion(null)}
            />
          ) : (
            <div className="text-muted-foreground">Loading map...</div>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-foreground">High Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500" />
            <span className="text-foreground">Medium Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#10B981]" />
            <span className="text-foreground">Low Risk</span>
          </div>
        </div>

        {/* Region Details */}
        {selectedRegionData && (
          <div className="mt-6 p-4 bg-muted rounded-lg border border-border">
            <h3 className="font-semibold text-foreground mb-2">
              {selectedRegion}: {selectedRegionData.details}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Risk Level</p>
                <p className="font-medium text-foreground capitalize">{selectedRegionData.risk}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Yield Anomaly</p>
                <p
                  className={`font-medium ${
                    selectedRegionData.yieldAnomaly < 0 ? 'text-red-600' : 'text-[#10B981]'
                  }`}
                >
                  {selectedRegionData.yieldAnomaly > 0 ? '+' : ''}
                  {selectedRegionData.yieldAnomaly}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
