'use client'

import React, { useEffect, useRef, useCallback } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Layer, PathOptions, LeafletMouseEvent } from 'leaflet'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Types
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

interface LeafletMapInnerProps {
  geoJSONData: GeoJSONData
  center: [number, number]
  zoom: number
  onAreaHover: (areaName: string | null) => void
  onAreaClick: (areaName: string) => void
  hoveredArea: string | null
  selectedArea: string | null
  isShowingDistricts: boolean
  shouldFitBounds: boolean
  onBoundsFitted: () => void
}

// Normalize geometry - handle nested geometries structure
function normalizeGeoJSON(data: GeoJSONData): GeoJSONData {
  return {
    ...data,
    features: data.features.map(feature => {
      // Handle nested geometries (GeometryCollection-like structure)
      if (feature.geometry && feature.geometry.geometries) {
        const firstGeom = feature.geometry.geometries[0]
        return {
          ...feature,
          geometry: firstGeom
        }
      }
      return feature
    })
  }
}

// Map bounds updater component - only fits when explicitly requested
function MapBoundsUpdater({ 
  geoJSONData, 
  shouldFitBounds, 
  onBoundsFitted 
}: { 
  geoJSONData: GeoJSONData
  shouldFitBounds: boolean
  onBoundsFitted: () => void 
}) {
  const map = useMap()
  const hasFittedRef = useRef(false)
  
  useEffect(() => {
    // Only fit bounds if explicitly requested and haven't done it yet for this data
    if (shouldFitBounds && geoJSONData && geoJSONData.features.length > 0 && !hasFittedRef.current) {
      try {
        const normalizedData = normalizeGeoJSON(geoJSONData)
        const geoJsonLayer = L.geoJSON(normalizedData as any)
        const bounds = geoJsonLayer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20], animate: true })
          hasFittedRef.current = true
          onBoundsFitted()
        }
      } catch (e) {
        console.error('Error fitting bounds:', e)
      }
    }
  }, [shouldFitBounds, geoJSONData, map, onBoundsFitted])
  
  // Reset the flag when data changes
  useEffect(() => {
    hasFittedRef.current = false
  }, [geoJSONData])
  
  return null
}

// Get area name from feature
function getAreaName(feature: GeoJSONFeature): string {
  return feature.properties.name || feature.properties.ADM1_EN || 'Unknown'
}

export function LeafletMapInner({
  geoJSONData,
  center,
  zoom,
  onAreaHover,
  onAreaClick,
  hoveredArea,
  selectedArea,
  isShowingDistricts,
  shouldFitBounds,
  onBoundsFitted
}: LeafletMapInnerProps) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null)
  const normalizedData = normalizeGeoJSON(geoJSONData)
  
  // Base style for all areas - uniform green with gray borders
  const getStyle = useCallback((feature: GeoJSONFeature | undefined): PathOptions => {
    if (!feature) return {}
    
    const areaName = getAreaName(feature)
    const isHovered = areaName === hoveredArea
    const isSelected = areaName === selectedArea
    
    return {
      fillColor: '#4ade80', // green-400 - uniform green for all
      weight: isHovered || isSelected ? 2 : 1,
      opacity: 1,
      color: isHovered || isSelected ? '#1e40af' : '#9ca3af', // blue when hovered, gray-400 otherwise
      fillOpacity: isHovered ? 0.7 : isSelected ? 0.8 : 0.5,
    }
  }, [hoveredArea, selectedArea])
  
  // Event handlers for each feature
  const onEachFeature = useCallback((feature: GeoJSONFeature, layer: Layer) => {
    const areaName = getAreaName(feature)
    
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        onAreaHover(areaName)
        
        const target = e.target
        target.setStyle({
          weight: 2,
          color: '#1e40af',
          fillOpacity: 0.7,
        })
        target.bringToFront()
      },
      mouseout: (e: LeafletMouseEvent) => {
        onAreaHover(null)
        
        const target = e.target
        const isSelected = areaName === selectedArea
        target.setStyle({
          weight: isSelected ? 2 : 1,
          color: isSelected ? '#1e40af' : '#9ca3af',
          fillOpacity: isSelected ? 0.8 : 0.5,
        })
      },
      click: () => {
        onAreaClick(areaName)
      }
    })
    
    // Add tooltip with area name
    layer.bindTooltip(areaName, {
      permanent: false,
      direction: 'auto',
      className: 'leaflet-tooltip-custom'
    })
  }, [onAreaHover, onAreaClick, selectedArea])
  
  // Update styles when selection changes
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.setStyle((feature) => getStyle(feature as GeoJSONFeature))
    }
  }, [hoveredArea, selectedArea, getStyle])

  // Generate a stable key for the GeoJSON layer
  const geoJsonKey = normalizedData.features.map(f => getAreaName(f)).join(',')

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-full"
      style={{ 
        backgroundColor: '#eff6ff',
        minHeight: '100%'
      }}
      zoomControl={true}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      dragging={true}
    >
      {/* GeoJSON Layer */}
      <GeoJSON
        key={geoJsonKey}
        ref={geoJsonRef as any}
        data={normalizedData as any}
        style={getStyle as any}
        onEachFeature={onEachFeature as any}
      />
      
      {/* Map bounds updater - only triggers when shouldFitBounds is true */}
      <MapBoundsUpdater 
        geoJSONData={normalizedData} 
        shouldFitBounds={shouldFitBounds}
        onBoundsFitted={onBoundsFitted}
      />
      
      {/* Custom CSS for tooltips and controls */}
      <style jsx global>{`
        .leaflet-tooltip-custom {
          background-color: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 500;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .leaflet-tooltip-custom::before {
          display: none;
        }
        .leaflet-container {
          font-family: inherit;
          background: #eff6ff;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          border-radius: 6px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background-color: white !important;
          color: #374151 !important;
          border: none !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #f3f4f6 !important;
        }
        .leaflet-control-zoom-in {
          border-bottom: 1px solid #e5e7eb !important;
        }
      `}</style>
    </MapContainer>
  )
}
