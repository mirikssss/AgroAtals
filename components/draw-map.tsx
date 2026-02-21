'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Square, 
  Pentagon, 
  Pencil, 
  Trash2, 
  MapPin,
  Layers,
  RotateCcw,
  Map,
  Satellite,
  Mountain,
  Grid3X3,
  Eye,
  EyeOff
} from 'lucide-react'
import type L from 'leaflet'

// Types for GeoJSON
interface GeoJSONData {
  type: 'FeatureCollection'
  features: any[]
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

// Types
export interface DetectedLocation {
  region: string | null
  district: string | null
  center: {
    lat: number
    lng: number
  }
}

export interface DrawnArea {
  type: 'rectangle' | 'polygon'
  coordinates: [number, number][]
  bounds?: {
    north: number
    south: number
    east: number
    west: number
  }
  area?: number // in hectares
  location?: DetectedLocation // Auto-detected location
}

interface DrawMapProps {
  onAreaDrawn: (area: DrawnArea | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
  /** Когда true, карта заполняет доступную высоту (для раскладки 60/40). */
  fillHeight?: boolean
}

// Point-in-polygon algorithm (ray casting)
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  
  return inside
}

// Extract coordinates from GeoJSON geometry
function getPolygonCoordinates(geometry: any): [number, number][][] {
  if (!geometry) return []
  
  if (geometry.type === 'Polygon') {
    // GeoJSON uses [lng, lat], we need [lat, lng]
    return geometry.coordinates.map((ring: number[][]) => 
      ring.map(([lng, lat]: number[]) => [lat, lng] as [number, number])
    )
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((poly: number[][][]) =>
      poly.map((ring: number[][]) => 
        ring.map(([lng, lat]: number[]) => [lat, lng] as [number, number])
      )
    )
  }
  
  return []
}

// Uzbekistan center coordinates
const UZBEKISTAN_CENTER: [number, number] = [41.3775, 64.5853]
const DEFAULT_ZOOM = 6

// Calculate area in hectares using Haversine formula
function calculateAreaHectares(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0
  
  const toRad = (deg: number) => deg * Math.PI / 180
  const R = 6371000 // Earth's radius in meters
  
  let area = 0
  const n = coordinates.length
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const lat1 = toRad(coordinates[i][0])
    const lat2 = toRad(coordinates[j][0])
    const lng1 = toRad(coordinates[i][1])
    const lng2 = toRad(coordinates[j][1])
    
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  
  area = Math.abs(area * R * R / 2)
  return area / 10000 // Convert to hectares
}

export function DrawMap({ 
  onAreaDrawn, 
  initialCenter = UZBEKISTAN_CENTER, 
  initialZoom = DEFAULT_ZOOM,
  fillHeight = false,
}: DrawMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const currentDrawHandler = useRef<any>(null)
  
  const [isLoaded, setIsLoaded] = useState(false)
  const [activeTool, setActiveTool] = useState<'rectangle' | 'polygon' | 'edit' | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [leaflet, setLeaflet] = useState<typeof L | null>(null)
  const [mapType, setMapType] = useState<'street' | 'satellite' | 'hybrid'>('satellite')
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  
  // Administrative boundaries state
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [regionsGeoJSON, setRegionsGeoJSON] = useState<GeoJSONData | null>(null)
  const [allDistrictsGeoJSON, setAllDistrictsGeoJSON] = useState<GeoJSONData | null>(null)
  const regionsLayerRef = useRef<L.GeoJSON | null>(null)
  const districtsLayerRef = useRef<L.GeoJSON | null>(null)
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null)

  // Load Leaflet dynamically (client-side only)
  useEffect(() => {
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet-draw')
      
      setLeaflet(L)
    }
    
    loadLeaflet()
  }, [])

  // Load GeoJSON data for regions and districts
  useEffect(() => {
    // Load regions
    fetch('/regions.json')
      .then(res => res.json())
      .then(data => setRegionsGeoJSON(data))
      .catch(err => console.error('Failed to load regions:', err))

    // Load all districts from all regions
    const loadAllDistricts = async () => {
      const allFeatures: any[] = []
      
      for (const [regionName, fileName] of Object.entries(regionFileMap)) {
        try {
          const res = await fetch(`/districts/${fileName}.json`)
          if (res.ok) {
            const data = await res.json()
            if (data.features) {
              allFeatures.push(...data.features)
            }
          }
        } catch (err) {
          console.error(`Failed to load districts for ${regionName}:`, err)
        }
      }
      
      if (allFeatures.length > 0) {
        setAllDistrictsGeoJSON({
          type: 'FeatureCollection',
          features: allFeatures
        })
      }
    }
    
    loadAllDistricts()
  }, [])

  // Initialize map
  useEffect(() => {
    if (!leaflet || !mapContainerRef.current || mapRef.current) return

    const L = leaflet

    // Fix default marker icons
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
    })

    // Add zoom control to top-left
    L.control.zoom({ position: 'topleft' }).addTo(map)

    // Add satellite tile layer by default (ESRI World Imagery)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    })
    satelliteLayer.addTo(map)
    tileLayerRef.current = satelliteLayer

    // Create feature group for drawn items
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Event handlers for draw events
    map.on('draw:created' as any, (e: any) => {
      const layer = e.layer
      drawnItems.clearLayers() // Only allow one shape at a time
      drawnItems.addLayer(layer)
      
      const area = extractAreaData(layer, e.layerType)
      setDrawnArea(area)
      onAreaDrawn(area)
      setActiveTool(null)
      currentDrawHandler.current = null
    })

    map.on('draw:edited' as any, (e: any) => {
      const layers = e.layers
      layers.eachLayer((layer: any) => {
        const layerType = layer.getBounds ? 'rectangle' : 'polygon'
        const area = extractAreaData(layer, layerType)
        setDrawnArea(area)
        onAreaDrawn(area)
      })
    })

    map.on('draw:deleted' as any, () => {
      setDrawnArea(null)
      setDetectedLocation(null)
      onAreaDrawn(null)
    })

    mapRef.current = map
    setIsLoaded(true)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [leaflet, initialCenter, initialZoom, onAreaDrawn])

  // При fillHeight: пересчитать размер карты при изменении контейнера (flex даёт высоту позже)
  useEffect(() => {
    if (!fillHeight || !mapRef.current || !mapContainerRef.current) return
    const map = mapRef.current
    const el = mapContainerRef.current
    const onResize = () => {
      map.invalidateSize()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    // Один раз после монтирования — layout может прийти с задержкой
    const t = setTimeout(onResize, 100)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [fillHeight, isLoaded])

  // Add/remove boundary layers when showBoundaries changes or GeoJSON loads
  useEffect(() => {
    if (!mapRef.current || !leaflet || !isLoaded) return

    const L = leaflet

    // Remove existing layers first
    if (regionsLayerRef.current) {
      mapRef.current.removeLayer(regionsLayerRef.current)
      regionsLayerRef.current = null
    }
    if (districtsLayerRef.current) {
      mapRef.current.removeLayer(districtsLayerRef.current)
      districtsLayerRef.current = null
    }

    if (!showBoundaries) return

    // Helper function to normalize geometry
    const normalizeGeoJSON = (data: GeoJSONData): GeoJSONData => ({
      ...data,
      features: data.features.map(feature => {
        if (feature.geometry && feature.geometry.geometries) {
          return { ...feature, geometry: feature.geometry.geometries[0] }
        }
        return feature
      })
    })

    // Add regions layer (thicker borders - yellow)
    if (regionsGeoJSON) {
      const normalizedRegions = normalizeGeoJSON(regionsGeoJSON)
      const regionsLayer = L.geoJSON(normalizedRegions as any, {
        style: () => ({
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 3,
          color: '#facc15', // Yellow
          opacity: 0.9,
        }),
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties?.name || feature.properties?.ADM1_EN || 'Unknown'
          layer.bindTooltip(name, {
            permanent: false,
            direction: 'auto',
            className: 'region-tooltip'
          })
          
          layer.on({
            mouseover: (e: any) => {
              setHoveredRegion(name)
              e.target.setStyle({
                weight: 4,
                color: '#fbbf24',
                fillColor: '#fbbf24',
                fillOpacity: 0.1,
              })
            },
            mouseout: (e: any) => {
              setHoveredRegion(null)
              e.target.setStyle({
                weight: 3,
                color: '#facc15',
                fillColor: 'transparent',
                fillOpacity: 0,
              })
            },
          })
        }
      })
      regionsLayer.addTo(mapRef.current)
      regionsLayerRef.current = regionsLayer
    }

    // Add districts layer (thinner borders - white)
    if (allDistrictsGeoJSON) {
      const normalizedDistricts = normalizeGeoJSON(allDistrictsGeoJSON)
      const districtsLayer = L.geoJSON(normalizedDistricts as any, {
        style: () => ({
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 1,
          color: '#ffffff', // White
          opacity: 0.6,
          dashArray: '3, 3',
        }),
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties?.name || feature.properties?.ADM2_EN || 'Unknown'
          layer.bindTooltip(name, {
            permanent: false,
            direction: 'auto',
            className: 'district-tooltip'
          })
          
          layer.on({
            mouseover: (e: any) => {
              e.target.setStyle({
                weight: 2,
                color: '#ffffff',
                fillColor: '#ffffff',
                fillOpacity: 0.15,
              })
            },
            mouseout: (e: any) => {
              e.target.setStyle({
                weight: 1,
                color: '#ffffff',
                fillColor: 'transparent',
                fillOpacity: 0,
              })
            },
          })
        }
      })
      districtsLayer.addTo(mapRef.current)
      districtsLayerRef.current = districtsLayer
    }
  }, [leaflet, isLoaded, showBoundaries, regionsGeoJSON, allDistrictsGeoJSON])

  // Find location (region and district) for a given point
  const findLocation = useCallback((centerLat: number, centerLng: number): DetectedLocation => {
    const point: [number, number] = [centerLat, centerLng]
    let detectedRegion: string | null = null
    let detectedDistrict: string | null = null

    // Helper to normalize geometry
    const normalizeGeometry = (feature: any) => {
      if (feature.geometry && feature.geometry.geometries) {
        return { ...feature, geometry: feature.geometry.geometries[0] }
      }
      return feature
    }

    // Find region
    if (regionsGeoJSON) {
      for (const feature of regionsGeoJSON.features) {
        const normalized = normalizeGeometry(feature)
        const polygons = getPolygonCoordinates(normalized.geometry)
        
        for (const polygon of polygons) {
          if (pointInPolygon(point, polygon)) {
            detectedRegion = feature.properties?.name || feature.properties?.ADM1_EN || null
            break
          }
        }
        if (detectedRegion) break
      }
    }

    // Find district
    if (allDistrictsGeoJSON) {
      for (const feature of allDistrictsGeoJSON.features) {
        const normalized = normalizeGeometry(feature)
        const polygons = getPolygonCoordinates(normalized.geometry)
        
        for (const polygon of polygons) {
          if (pointInPolygon(point, polygon)) {
            detectedDistrict = feature.properties?.name || feature.properties?.ADM2_EN || null
            break
          }
        }
        if (detectedDistrict) break
      }
    }

    return {
      region: detectedRegion,
      district: detectedDistrict,
      center: { lat: centerLat, lng: centerLng }
    }
  }, [regionsGeoJSON, allDistrictsGeoJSON])

  // Update location when drawnArea changes and GeoJSON is available
  useEffect(() => {
    if (!drawnArea || !drawnArea.bounds) {
      setDetectedLocation(null)
      return
    }

    const centerLat = (drawnArea.bounds.north + drawnArea.bounds.south) / 2
    const centerLng = (drawnArea.bounds.east + drawnArea.bounds.west) / 2
    const location = findLocation(centerLat, centerLng)
    
    setDetectedLocation(location)
    
    // Update the drawnArea with location and notify parent
    const updatedArea = { ...drawnArea, location }
    onAreaDrawn(updatedArea)
  }, [drawnArea?.bounds, regionsGeoJSON, allDistrictsGeoJSON, findLocation, onAreaDrawn])

  // Extract area data from drawn layer
  const extractAreaData = useCallback((layer: any, layerType: string): DrawnArea => {
    let coordinates: [number, number][] = []
    let bounds = undefined
    
    if (layerType === 'rectangle') {
      const rectBounds = layer.getBounds()
      bounds = {
        north: rectBounds.getNorth(),
        south: rectBounds.getSouth(),
        east: rectBounds.getEast(),
        west: rectBounds.getWest(),
      }
      coordinates = [
        [bounds.north, bounds.west],
        [bounds.north, bounds.east],
        [bounds.south, bounds.east],
        [bounds.south, bounds.west],
      ]
    } else {
      const latLngs = layer.getLatLngs()[0]
      coordinates = latLngs.map((ll: any) => [ll.lat, ll.lng] as [number, number])
      
      // Calculate bounds for polygon
      const lats = coordinates.map(c => c[0])
      const lngs = coordinates.map(c => c[1])
      bounds = {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        west: Math.min(...lngs),
      }
    }

    // Calculate area in hectares
    const areaHa = calculateAreaHectares(coordinates)

    // Detect location based on center point
    const centerLat = bounds ? (bounds.north + bounds.south) / 2 : 0
    const centerLng = bounds ? (bounds.east + bounds.west) / 2 : 0
    const location = findLocation(centerLat, centerLng)

    return {
      type: layerType as 'rectangle' | 'polygon',
      coordinates,
      bounds,
      area: Math.round(areaHa * 100) / 100,
      location,
    }
  }, [findLocation])

  // Tool handlers
  const startDrawRectangle = useCallback(() => {
    if (!mapRef.current || !leaflet) return
    
    // Disable current handler if any
    if (currentDrawHandler.current) {
      currentDrawHandler.current.disable()
    }
    
    setActiveTool('rectangle')
    
    const L = leaflet as any
    const drawHandler = new L.Draw.Rectangle(mapRef.current, {
      shapeOptions: {
        color: '#10B981',
        weight: 2,
        fillColor: '#10B981',
        fillOpacity: 0.2,
      },
    })
    drawHandler.enable()
    currentDrawHandler.current = drawHandler
  }, [leaflet])

  const startDrawPolygon = useCallback(() => {
    if (!mapRef.current || !leaflet) return
    
    // Disable current handler if any
    if (currentDrawHandler.current) {
      currentDrawHandler.current.disable()
    }
    
    setActiveTool('polygon')
    
    const L = leaflet as any
    const drawHandler = new L.Draw.Polygon(mapRef.current, {
      shapeOptions: {
        color: '#10B981',
        weight: 2,
        fillColor: '#10B981',
        fillOpacity: 0.2,
      },
    })
    drawHandler.enable()
    currentDrawHandler.current = drawHandler
  }, [leaflet])

  const startEdit = useCallback(() => {
    if (!mapRef.current || !drawnItemsRef.current || !leaflet) return
    
    if (drawnItemsRef.current.getLayers().length === 0) return
    
    // Disable current handler if any
    if (currentDrawHandler.current) {
      currentDrawHandler.current.disable()
    }
    
    setActiveTool('edit')
    
    const L = leaflet as any
    const editHandler = new L.EditToolbar.Edit(mapRef.current, {
      featureGroup: drawnItemsRef.current,
    })
    editHandler.enable()
    currentDrawHandler.current = editHandler
  }, [leaflet])

  const clearDrawings = useCallback(() => {
    if (!drawnItemsRef.current) return
    drawnItemsRef.current.clearLayers()
    setDrawnArea(null)
    setDetectedLocation(null)
    onAreaDrawn(null)
    setActiveTool(null)
  }, [onAreaDrawn])

  const resetView = useCallback(() => {
    if (!mapRef.current) return
    mapRef.current.setView(initialCenter, initialZoom)
  }, [initialCenter, initialZoom])

  // Switch map type
  const switchMapType = useCallback((type: 'street' | 'satellite' | 'hybrid') => {
    if (!mapRef.current || !leaflet) return
    
    const L = leaflet
    
    // Remove current tile layer
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current)
    }
    
    let newLayer: L.TileLayer
    
    if (type === 'street') {
      newLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      })
    } else if (type === 'satellite') {
      newLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      })
    } else {
      // Hybrid - satellite with labels
      newLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      })
      // Add labels layer on top
      const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        pane: 'shadowPane',
      })
      labelsLayer.addTo(mapRef.current)
    }
    
    newLayer.addTo(mapRef.current)
    tileLayerRef.current = newLayer
    setMapType(type)
  }, [leaflet])

  const glassCard = 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-white/40 dark:border-slate-600/40 shadow-lg shadow-black/5'

  return (
    <Card className={`overflow-hidden ${fillHeight ? 'relative flex-1 min-h-0 h-full w-full border-0 bg-transparent shadow-none' : 'border-border/50'}`}>
      {/* Toolbar — при fillHeight плавающая стеклянная карточка */}
      <div
        className={
          fillHeight
            ? `absolute top-4 right-4 z-10 p-2 flex items-center gap-2 flex-wrap max-w-[90vw] ${glassCard}`
            : 'bg-white dark:bg-gray-900 border-b border-border/50 p-2 flex items-center gap-2'
        }
      >
        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          <Button
            variant={activeTool === 'rectangle' ? 'default' : 'ghost'}
            size="sm"
            onClick={startDrawRectangle}
            className={activeTool === 'rectangle' ? 'bg-[#10B981] hover:bg-[#059669]' : ''}
            title="Draw Rectangle"
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            variant={activeTool === 'polygon' ? 'default' : 'ghost'}
            size="sm"
            onClick={startDrawPolygon}
            className={activeTool === 'polygon' ? 'bg-[#10B981] hover:bg-[#059669]' : ''}
            title="Draw Polygon"
          >
            <Pentagon className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          <Button
            variant={activeTool === 'edit' ? 'default' : 'ghost'}
            size="sm"
            onClick={startEdit}
            disabled={!drawnArea}
            className={activeTool === 'edit' ? 'bg-[#10B981] hover:bg-[#059669]' : ''}
            title="Edit Layers"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDrawings}
            disabled={!drawnArea}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            title="Delete Drawings"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetView}
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Map Type Switcher */}
        <div className="flex items-center gap-1 border-r border-border/50 pr-2">
          <Button
            variant={mapType === 'street' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => switchMapType('street')}
            className={mapType === 'street' ? 'bg-blue-500 hover:bg-blue-600' : ''}
            title="Street Map"
          >
            <Map className="w-4 h-4" />
          </Button>
          <Button
            variant={mapType === 'satellite' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => switchMapType('satellite')}
            className={mapType === 'satellite' ? 'bg-blue-500 hover:bg-blue-600' : ''}
            title="Satellite"
          >
            <Satellite className="w-4 h-4" />
          </Button>
          <Button
            variant={mapType === 'hybrid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => switchMapType('hybrid')}
            className={mapType === 'hybrid' ? 'bg-blue-500 hover:bg-blue-600' : ''}
            title="Hybrid (Satellite + Labels)"
          >
            <Mountain className="w-4 h-4" />
          </Button>
        </div>

        {/* Boundaries Toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant={showBoundaries ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setShowBoundaries(!showBoundaries)}
            className={showBoundaries ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
            title={showBoundaries ? 'Hide Boundaries' : 'Show Boundaries'}
          >
            <Grid3X3 className="w-4 h-4" />
            {showBoundaries ? <Eye className="w-3 h-3 ml-1" /> : <EyeOff className="w-3 h-3 ml-1" />}
          </Button>
        </div>

        {/* Hovered region info */}
        {hoveredRegion && !drawnArea && (
          <div className="ml-auto flex items-center gap-2 text-sm text-yellow-600">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">{hoveredRegion}</span>
          </div>
        )}

        {/* Area info */}
        {drawnArea && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Layers className="w-4 h-4" />
              <span className="capitalize">{drawnArea.type}</span>
            </div>
            <div className="flex items-center gap-1 font-medium text-[#10B981]">
              <MapPin className="w-4 h-4" />
              <span>{drawnArea.area?.toLocaleString()} ha</span>
            </div>
          </div>
        )}
      </div>

      {/* Detected Location Banner — при fillHeight стеклянная карточка */}
      {detectedLocation && (detectedLocation.region || detectedLocation.district) && (
        <div
          className={
            fillHeight
              ? `absolute top-4 left-[324px] z-10 px-4 py-3 rounded-2xl ${glassCard} border-green-200/50 dark:border-green-800/50`
              : 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-b border-green-200 dark:border-green-800 px-4 py-3'
          }
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900">
                <MapPin className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                  Detected Location
                </p>
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                  {detectedLocation.district && <span>{detectedLocation.district}</span>}
                  {detectedLocation.district && detectedLocation.region && <span className="text-green-500"> • </span>}
                  {detectedLocation.region && <span className="text-green-700 dark:text-green-300">{detectedLocation.region}</span>}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-600 dark:text-green-400">Coordinates</p>
              <p className="text-xs font-mono text-green-800 dark:text-green-200">
                {detectedLocation.center.lat.toFixed(4)}°N, {detectedLocation.center.lng.toFixed(4)}°E
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Map Container — при fillHeight absolute inset-0 (карта на весь экран), иначе в потоке */}
      <div
        ref={mapContainerRef}
        className={`w-full bg-gray-100 dark:bg-gray-800 ${fillHeight ? 'absolute inset-0 z-0' : 'h-[400px]'}`}
        style={!fillHeight ? { minHeight: '400px' } : undefined}
      >
        {!isLoaded && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div>
          </div>
        )}
      </div>

      {/* Instructions / legends — при fillHeight на мобилке скрыты, чтобы не занимать место */}
      <div
        className={
          fillHeight
            ? `absolute bottom-4 left-4 right-4 z-10 p-3 text-xs text-muted-foreground rounded-2xl ${glassCard} max-md:hidden`
            : 'bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-muted-foreground border-t border-border/50 max-md:hidden'
        }
      >
        <div className="flex items-center gap-4 flex-wrap">
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">□</kbd> Draw rectangle</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">⬠</kbd> Draw polygon</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">✎</kbd> Edit shape</span>
          <span className="text-yellow-600"><span className="inline-block w-3 h-0.5 bg-yellow-500 mr-1"></span> Region borders</span>
          <span className="text-gray-400"><span className="inline-block w-3 h-0.5 bg-white border border-gray-300 mr-1"></span> District borders</span>
          <span className="ml-auto">Draw your agricultural area on the map</span>
        </div>
      </div>

      {/* Tooltip Styles */}
      <style jsx global>{`
        .region-tooltip {
          background-color: #fef3c7 !important;
          border: 1px solid #f59e0b !important;
          border-radius: 4px !important;
          padding: 4px 8px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          color: #92400e !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }
        .region-tooltip::before {
          border-top-color: #f59e0b !important;
        }
        .district-tooltip {
          background-color: white !important;
          border: 1px solid #d1d5db !important;
          border-radius: 4px !important;
          padding: 4px 8px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          color: #374151 !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
        }
        .district-tooltip::before {
          border-top-color: #d1d5db !important;
        }
      `}</style>
    </Card>
  )
}

export default DrawMap
