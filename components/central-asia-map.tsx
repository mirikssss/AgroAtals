'use client'

import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, MapPin } from 'lucide-react'

// Central Asia regions data structure
const centralAsiaData = {
  Kazakhstan: {
    color: '#3b82f6',
    regions: {
      'Almaty': { population: '2345012', subregions: ['Almaty City', 'Almaty Region', 'Aktobe'] },
      'Astana': { population: '1630640', subregions: ['Akmol Region', 'Akmodin', 'Karaganda'] },
      'Atyrau': { population: '715428', subregions: ['Atyrau City', 'Atyrau Region'] },
      'West Kazakhstan': { population: '695562', subregions: ['Mangystau', 'Ustyurt'] },
      'Karaganda': { population: '955310', subregions: ['Karaganda City', 'Karaganda Region'] },
      'Kunduz': { population: '821761', subregions: ['Kunduz City', 'Kunduz Rural', 'Northern Kunduz'] },
    }
  },
  Uzbekistan: {
    color: '#06b6d4',
    regions: {
      'Tashkent': { population: '2148168', subregions: ['Tashkent City', 'Tashkent Region'] },
      'Fergana': { population: '1291011', subregions: ['Fergana City', 'Fergana Valley'] },
      'Samarkand': { population: '1215892', subregions: ['Samarkand City', 'Samarkand Region'] },
      'Bukhara': { population: '845912', subregions: ['Bukhara City', 'Bukhara Region'] },
    }
  },
  Tajikistan: {
    color: '#0ea5e9',
    regions: {
      'Dushanbe': { population: '867909', subregions: ['Dushanbe City', 'Dushanbe Region'] },
      'Gorno-Badakhshan': { population: '219200', subregions: ['Khorog', 'Ishkashim'] },
    }
  },
  Kyrgyzstan: {
    color: '#06b6d4',
    regions: {
      'Bishkek': { population: '687909', subregions: ['Bishkek City', 'Chuy Region'] },
      'Issyk-Kul': { population: '596000', subregions: ['Karakol', 'Issyk-Kul Lake'] },
    }
  },
  Turkmenistan: {
    color: '#0ea5e9',
    regions: {
      'Ashkhabad': { population: '1131438', subregions: ['Ashkhabad City', 'Ahal Region'] },
      'Dashhowuz': { population: '719361', subregions: ['Dashhowuz City', 'Amudarya'] },
      'Balkan': { population: '1592652', subregions: ['Balkan Region', 'Turkmenbashi'] },
    }
  }
}

type LocationLevel = 'country' | 'region' | 'subregion'

interface MapSelectionProps {
  onLocationSelect: (lat: string, lon: string, location: string) => void
  initialLocation?: string
}

const countryCoordinates: Record<string, { lat: string; lon: string }> = {
  'Kazakhstan-Almaty': { lat: '43.2380', lon: '76.9440' },
  'Kazakhstan-Astana': { lat: '51.1694', lon: '71.4491' },
  'Kazakhstan-Atyrau': { lat: '43.6689', lon: '51.2802' },
  'Kazakhstan-West Kazakhstan': { lat: '43.6050', lon: '51.3787' },
  'Kazakhstan-Karaganda': { lat: '49.8047', lon: '72.8964' },
  'Kazakhstan-Kunduz': { lat: '37.1219', lon: '68.8637' },
  'Uzbekistan-Tashkent': { lat: '41.2995', lon: '69.2401' },
  'Uzbekistan-Fergana': { lat: '40.3899', lon: '71.7728' },
  'Uzbekistan-Samarkand': { lat: '39.6548', lon: '66.9597' },
  'Uzbekistan-Bukhara': { lat: '39.7747', lon: '64.4286' },
  'Tajikistan-Dushanbe': { lat: '38.5598', lon: '68.7738' },
  'Tajikistan-Gorno-Badakhshan': { lat: '36.8465', lon: '71.5249' },
  'Kyrgyzstan-Bishkek': { lat: '42.8746', lon: '74.5698' },
  'Kyrgyzstan-Issyk-Kul': { lat: '42.5069', lon: '77.5064' },
  'Turkmenistan-Ashkhabad': { lat: '37.9601', lon: '58.3261' },
  'Turkmenistan-Dashhowuz': { lat: '42.5017', lon: '59.5569' },
  'Turkmenistan-Balkan': { lat: '38.9697', lon: '52.5911' },
}

export function CentralAsiaMap({ onLocationSelect, initialLocation }: MapSelectionProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>('Kazakhstan')
  const [selectedRegion, setSelectedRegion] = useState<string>('Almaty')
  const [selectedSubregion, setSelectedSubregion] = useState<string>('')
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)

  const countries = Object.keys(centralAsiaData) as Array<keyof typeof centralAsiaData>
  const regions = selectedCountry ? Object.keys((centralAsiaData as any)[selectedCountry].regions) : []
  const subregions = selectedCountry && selectedRegion 
    ? (centralAsiaData as any)[selectedCountry].regions[selectedRegion]?.subregions || []
    : []

  const handleLocationChange = () => {
    const key = `${selectedCountry}-${selectedRegion}`
    const coords = countryCoordinates[key]
    if (coords) {
      const location = selectedSubregion ? selectedSubregion : selectedRegion
      onLocationSelect(coords.lat, coords.lon, `${selectedCountry}, ${location}`)
    }
  }

  const currentData = selectedCountry ? (centralAsiaData as any)[selectedCountry] : null
  const regionData = currentData && selectedRegion ? currentData.regions[selectedRegion] : null

  return (
    <div className="space-y-6">
      {/* Selection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Country</label>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="bg-input/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {countries.map((country) => (
                <SelectItem key={country} value={country}>{country}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Region</label>
          <Select value={selectedRegion} onValueChange={(val) => {
            setSelectedRegion(val)
            setSelectedSubregion('')
          }}>
            <SelectTrigger className="bg-input/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {regions.map((region) => (
                <SelectItem key={region} value={region}>{region}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Subregion (Optional)</label>
          <Select value={selectedSubregion} onValueChange={setSelectedSubregion}>
            <SelectTrigger className="bg-input/50 border-border">
              <SelectValue placeholder="Select subregion..." />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {subregions.map((subregion) => (
                <SelectItem key={subregion} value={subregion}>{subregion}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Map Visualization */}
      <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-border/50 p-8 overflow-hidden">
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">Central Asia Region Map</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedCountry} - {selectedRegion} 
              {selectedSubregion && ` - ${selectedSubregion}`}
            </p>
          </div>

          {/* Simplified Map Representation */}
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 border border-border">
            <svg viewBox="0 0 1000 600" className="w-full h-auto max-h-96">
              {/* Kazakhstan regions - light blue base */}
              <g>
                {/* Almaty (selected highlight) */}
                <rect 
                  x="400" y="450" width="150" height="80" 
                  fill={selectedRegion === 'Almaty' ? '#1d4ed8' : '#93c5fd'} 
                  stroke="#3b82f6" 
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition"
                  onMouseEnter={() => setHoveredRegion('Almaty')}
                  onMouseLeave={() => setHoveredRegion(null)}
                />
                <text x="475" y="510" textAnchor="middle" fill={selectedRegion === 'Almaty' ? 'white' : '#1e40af'} fontSize="14" fontWeight="bold">
                  {(centralAsiaData.Kazakhstan.regions.Almaty as any).population}
                </text>

                {/* Astana region */}
                <rect 
                  x="550" y="150" width="140" height="100" 
                  fill={selectedRegion === 'Astana' ? '#1d4ed8' : '#93c5fd'} 
                  stroke="#3b82f6" 
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition"
                  onMouseEnter={() => setHoveredRegion('Astana')}
                  onMouseLeave={() => setHoveredRegion(null)}
                />
                <text x="620" y="220" textAnchor="middle" fill={selectedRegion === 'Astana' ? 'white' : '#1e40af'} fontSize="14" fontWeight="bold">
                  {(centralAsiaData.Kazakhstan.regions.Astana as any).population}
                </text>

                {/* Atyrau region */}
                <rect 
                  x="250" y="250" width="100" height="120" 
                  fill={selectedRegion === 'Atyrau' ? '#1d4ed8' : '#93c5fd'} 
                  stroke="#3b82f6" 
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition"
                  onMouseEnter={() => setHoveredRegion('Atyrau')}
                  onMouseLeave={() => setHoveredRegion(null)}
                />
                <text x="300" y="330" textAnchor="middle" fill={selectedRegion === 'Atyrau' ? 'white' : '#1e40af'} fontSize="12" fontWeight="bold">
                  {(centralAsiaData.Kazakhstan.regions.Atyrau as any).population}
                </text>

                {/* Karaganda region */}
                <rect 
                  x="500" y="250" width="90" height="110" 
                  fill={selectedRegion === 'Karaganda' ? '#1d4ed8' : '#93c5fd'} 
                  stroke="#3b82f6" 
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition"
                  onMouseEnter={() => setHoveredRegion('Karaganda')}
                  onMouseLeave={() => setHoveredRegion(null)}
                />
                <text x="545" y="315" textAnchor="middle" fill={selectedRegion === 'Karaganda' ? 'white' : '#1e40af'} fontSize="12" fontWeight="bold">
                  {(centralAsiaData.Kazakhstan.regions.Karaganda as any).population}
                </text>
              </g>

              {/* Uzbekistan regions */}
              <g>
                <rect x="200" y="380" width="100" height="80" fill={selectedCountry === 'Uzbekistan' ? '#06b6d4' : '#a5f3fc'} stroke="#0891b2" strokeWidth="2" className="cursor-pointer hover:opacity-80 transition" />
                <text x="250" y="425" textAnchor="middle" fill="#0c4a6e" fontSize="12">Uzbek</text>
              </g>

              {/* Tajikistan region */}
              <g>
                <rect x="650" y="350" width="80" height="90" fill={selectedCountry === 'Tajikistan' ? '#0ea5e9' : '#bae6fd'} stroke="#0284c7" strokeWidth="2" className="cursor-pointer hover:opacity-80 transition" />
                <text x="690" y="400" textAnchor="middle" fill="#0c4a6e" fontSize="12">Tajik</text>
              </g>

              {/* Kyrgyzstan region */}
              <g>
                <circle cx="550" cy="200" r="50" fill={selectedCountry === 'Kyrgyzstan' ? '#06b6d4' : '#a5f3fc'} stroke="#0891b2" strokeWidth="2" className="cursor-pointer hover:opacity-80 transition" />
                <text x="550" y="205" textAnchor="middle" fill="#0c4a6e" fontSize="12" fontWeight="bold">Kyrgyz</text>
              </g>

              {/* Turkmenistan region */}
              <g>
                <rect x="100" y="450" width="140" height="110" fill={selectedCountry === 'Turkmenistan' ? '#0ea5e9' : '#bae6fd'} stroke="#0284c7" strokeWidth="2" className="cursor-pointer hover:opacity-80 transition" />
                <text x="170" y="510" textAnchor="middle" fill="#0c4a6e" fontSize="12">Turkmen</text>
              </g>

              {/* Current selection indicator */}
              {hoveredRegion && (
                <circle cx="475" cy="510" r="35" fill="none" stroke="#10B981" strokeWidth="3" strokeDasharray="5,5" />
              )}
            </svg>
          </div>

          {/* Region Info */}
          {regionData && (
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Region</p>
                  <p className="font-semibold text-foreground">{selectedRegion}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Population</p>
                  <p className="font-semibold text-foreground">{regionData.population}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          onClick={handleLocationChange}
          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-6 font-semibold rounded-lg text-base shadow-sm hover:shadow-md transition-all"
        >
          <MapPin className="w-4 h-4 mr-2" />
          Select Location
        </Button>
      </div>
    </div>
  )
}
