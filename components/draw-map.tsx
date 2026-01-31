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
  Mountain
} from 'lucide-react'
import type L from 'leaflet'

// Types
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
}

interface DrawMapProps {
  onAreaDrawn: (area: DrawnArea | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
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
  initialZoom = DEFAULT_ZOOM 
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

  // Load Leaflet dynamically (client-side only)
  useEffect(() => {
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet-draw')
      
      setLeaflet(L)
    }
    
    loadLeaflet()
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
      onAreaDrawn(null)
    })

    mapRef.current = map
    setIsLoaded(true)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [leaflet, initialCenter, initialZoom, onAreaDrawn])

  // Extract area data from drawn layer
  const extractAreaData = (layer: any, layerType: string): DrawnArea => {
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

    return {
      type: layerType as 'rectangle' | 'polygon',
      coordinates,
      bounds,
      area: Math.round(areaHa * 100) / 100,
    }
  }

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

  return (
    <Card className="overflow-hidden border-border/50">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-900 border-b border-border/50 p-2 flex items-center gap-2">
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
        <div className="flex items-center gap-1">
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

      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        className="h-[400px] w-full bg-gray-100 dark:bg-gray-800"
        style={{ minHeight: '400px' }}
      >
        {!isLoaded && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-muted-foreground border-t border-border/50">
        <div className="flex items-center gap-4">
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">□</kbd> Draw rectangle</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">⬠</kbd> Draw polygon</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">✎</kbd> Edit shape</span>
          <span className="ml-auto">Draw your agricultural area on the map</span>
        </div>
      </div>
    </Card>
  )
}

export default DrawMap
