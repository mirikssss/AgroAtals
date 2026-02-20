'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Satellite, Loader2, AlertCircle, ImageIcon, SlidersHorizontal } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { useLayoutScale } from '@/lib/layout-scale'

const DASHBOARD_API_URL = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:8000'
const YEAR_MIN = 2017
const THUMBNAIL_COUNT = 8

export interface SatelliteEvidenceProps {
  /** Polygon as [lat, lng][] from drawn area */
  coordinates: [number, number][]
  crop: string
  country?: string
}

interface YearImage {
  year: number
  imageUrl: string | null
  cloudHint?: string | null
  compositeWindow?: string
  source?: string
}

interface SatelliteDiagnostics {
  areaHa?: number
  bboxMeters?: { width: number; height: number }
  gsdMeters?: number
  neededPx?: number
  requestedSizePx?: number
  effectiveGsdM?: number
  imageWidth?: number
  imageHeight?: number
  note?: string
}

interface TimelapseResponse {
  year_used: number
  years: YearImage[]
  baseline: { imageUrl: string | null; yearsUsed: number[]; cloudHint?: string | null }
  diagnostics?: SatelliteDiagnostics
  error?: string
}

/** Subtle "satellite scan" overlay while image is loading */
function ScanOverlay({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg pointer-events-none overflow-hidden">
      <div className="absolute inset-0 opacity-30 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-satellite-scan" />
      <div className="flex flex-col items-center gap-2 text-primary">
        <Satellite className="w-10 h-10 animate-pulse" />
        <span className="text-xs font-medium">Loading satellite composite...</span>
      </div>
    </div>
  )
}

export function SatelliteEvidence({ coordinates, crop, country = 'UZB' }: SatelliteEvidenceProps) {
  const { t } = useLanguage()
  const { s, sx, sy } = useLayoutScale()
  const currentYear = new Date().getFullYear()
  const yearMax = Math.min(currentYear, 2025)

  const [product, setProduct] = useState<'truecolor' | 'ndvi'>('truecolor')
  const [selectedYear, setSelectedYear] = useState(yearMax)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSlider, setCompareSlider] = useState(50) // 0 = baseline, 100 = selected year
  const [data, setData] = useState<TimelapseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const compareContainerRef = useRef<HTMLDivElement>(null)

  const fetchTimelapse = useCallback(async (year: number) => {
    if (coordinates.length < 3) return
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${DASHBOARD_API_URL}/dashboard/satellite/timelapse`)
      url.searchParams.set('polygon', JSON.stringify(coordinates))
      url.searchParams.set('country', country)
      url.searchParams.set('crop', crop)
      url.searchParams.set('year', String(year))
      url.searchParams.set('product', product)
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: TimelapseResponse = await res.json()
      setData(json)
      if (json.error) setError(json.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load satellite data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [coordinates, country, crop, product])

  // Загружаем один раз при смене продукта или полигона — все годы приходят в одном ответе, перемотка без повторных запросов
  useEffect(() => {
    fetchTimelapse(yearMax)
  }, [product, coordinates, country, crop, yearMax, fetchTimelapse])

  const years = data?.years ?? []
  const selectedFrame = years.find((f) => f.year === selectedYear)
  const baselineUrl = data?.baseline?.imageUrl ?? null
  const mainUrl = selectedFrame?.imageUrl ?? null
  const displayUrl = compareMode ? null : mainUrl

  const thumbnailYears = (() => {
    if (years.length <= THUMBNAIL_COUNT) return years.map((y) => y.year)
    const step = (yearMax - YEAR_MIN) / (THUMBNAIL_COUNT - 1)
    return Array.from({ length: THUMBNAIL_COUNT }, (_, i) =>
      Math.round(YEAR_MIN + step * i)
    ).filter((y) => y <= yearMax)
  })()

  if (coordinates.length < 3) {
    return (
      <Card className="p-6 border-border/50 bg-muted/30">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ImageIcon className="w-8 h-8" />
          <div>
            <h3 className="font-semibold text-foreground">{t('satelliteEvidence')}</h3>
            <p className="text-sm">{t('satelliteEvidenceDrawPolygon')}</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border border-border/80 bg-card shadow-sm">
      {/* Header */}
      <div
        className="border-b border-border/60 bg-muted/30"
        style={{ padding: `${sy(16)}px ${sx(20)}px` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl bg-primary/10 text-primary"
              style={{ width: s(40), height: s(40) }}
            >
              <Satellite style={{ width: s(20), height: s(20) }} className="shrink-0" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{t('satelliteEvidence')}</h3>
              <p className="text-xs text-muted-foreground">{t('satelliteEvidenceSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-border bg-background/80 p-0.5">
              <button
                type="button"
                onClick={() => setProduct('truecolor')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  product === 'truecolor' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                True Color
              </button>
              <button
                type="button"
                onClick={() => setProduct('ndvi')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  product === 'ndvi' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                NDVI
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 hover:bg-muted/50">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm text-muted-foreground">{t('satelliteCompareMode')}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-5" style={{ padding: sx(20) }}>
        {/* Year slider — перемотка без повторной загрузки */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{t('satelliteYear')}: {selectedYear}</span>
            <span className="text-xs text-muted-foreground">{YEAR_MIN} — {yearMax}</span>
          </div>
          <input
            type="range"
            min={YEAR_MIN}
            max={yearMax}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
          />
        </div>

        {/* Main viewer: aspect ratio preserved, image fit contain (no stretch) */}
        <div
          className="relative w-full mx-auto rounded-xl bg-muted/50 border border-border overflow-hidden shadow-inner"
          style={{ maxWidth: sx(896), aspectRatio: '16/9', minHeight: sy(200) }}
        >
        {loading && <ScanOverlay active />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-destructive p-4">
            <AlertCircle className="w-10 h-10" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}
        {!loading && !error && compareMode && baselineUrl && mainUrl && (
          <div ref={compareContainerRef} className="relative w-full h-full select-none">
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compareSlider}% 0 0)` }}>
              <img src={baselineUrl} alt="Baseline" className="w-full h-full object-contain pointer-events-none" />
            </div>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${compareSlider}%)` }}>
              <img src={mainUrl} alt={`${selectedYear}`} className="w-full h-full object-contain pointer-events-none" />
            </div>
            <div
              role="slider"
              aria-valuenow={compareSlider}
              tabIndex={0}
              className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center z-10 group"
              style={{ left: `${compareSlider}%` }}
              onMouseDown={(e) => {
                e.preventDefault()
                const el = compareContainerRef.current
                const move = (ev: MouseEvent) => {
                  if (!el) return
                  const rect = el.getBoundingClientRect()
                  const pct = ((ev.clientX - rect.left) / rect.width) * 100
                  setCompareSlider(Math.max(0, Math.min(100, pct)))
                }
                const up = () => {
                  window.removeEventListener('mousemove', move)
                  window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move)
                window.addEventListener('mouseup', up)
              }}
              onTouchStart={(e) => {
                const el = compareContainerRef.current
                const touch = (ev: TouchEvent) => {
                  if (!el || !ev.touches[0]) return
                  const rect = el.getBoundingClientRect()
                  const pct = ((ev.touches[0].clientX - rect.left) / rect.width) * 100
                  setCompareSlider(Math.max(0, Math.min(100, pct)))
                }
                const end = () => {
                  window.removeEventListener('touchmove', touch)
                  window.removeEventListener('touchend', end)
                }
                window.addEventListener('touchmove', touch, { passive: true })
                window.addEventListener('touchend', end)
              }}
            >
              <div className="w-1.5 h-14 rounded-full bg-primary shadow-lg border-2 border-white group-hover:scale-110 transition-transform" />
            </div>
          </div>
        )}
        {!loading && !error && !compareMode && displayUrl && (
          <img
            src={displayUrl}
            alt={`${selectedYear} ${product}`}
            className="w-full h-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget
              const natW = img.naturalWidth
              const natH = img.naturalHeight
              const rect = img.getBoundingClientRect()
              const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
              if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
                console.log('[SatelliteEvidence] image loaded:', {
                  naturalWidth: natW,
                  naturalHeight: natH,
                  displayCssPx: { width: Math.round(rect.width), height: Math.round(rect.height) },
                  devicePixelRatio: dpr,
                  displayPhysicalPx: { width: Math.round(rect.width * dpr), height: Math.round(rect.height * dpr) },
                  upscale: rect.width > 0 ? (natW > 0 ? (rect.width / natW).toFixed(1) : 'n/a') : 'n/a',
                  apiDiagnostics: data?.diagnostics ?? null,
                })
              }
            }}
          />
        )}
        {!loading && !error && !displayUrl && !(compareMode && baselineUrl && mainUrl) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin" />
            <span className="text-sm">{t('satelliteNoImage')}</span>
          </div>
        )}
      </div>

        {/* Compare mode labels */}
        {compareMode && data?.baseline?.yearsUsed?.length && (
          <div
            className="flex justify-between rounded-lg bg-muted/50 text-xs text-muted-foreground"
            style={{ padding: `${sy(8)}px ${sx(12)}px` }}
          >
            <span>Baseline (years {data.baseline.yearsUsed.join(', ')})</span>
            <span>{selectedYear}</span>
          </div>
        )}

        {/* Caption */}
        {(selectedFrame || data?.baseline) && (
          <div
            className="rounded-lg border border-border/60 bg-muted/20 text-xs text-muted-foreground space-y-0.5"
            style={{ padding: `${sy(8)}px ${sx(12)}px` }}
          >
            <p>
              <span className="font-medium text-foreground">{selectedYear}</span>
              {selectedFrame?.compositeWindow && ` · ${selectedFrame.compositeWindow}`}
            </p>
            <p>{selectedFrame?.source ?? 'Sentinel-2 L2A (Copernicus)'}</p>
            {data?.diagnostics && (
              <p>
                Area ~{data.diagnostics.areaHa ?? '?'} ha
                {data.diagnostics.imageWidth != null && data.diagnostics.imageHeight != null && (
                  <> · Image {data.diagnostics.imageWidth}×{data.diagnostics.imageHeight} px</>
                )}
                {data.diagnostics.effectiveGsdM != null && <> · {data.diagnostics.effectiveGsdM} m/px</>}
              </p>
            )}
            {(data?.diagnostics?.areaHa ?? 999) < 15 && (
              <p className="italic">Small areas (5–10 ha) have few pixels at 10 m/px; image may look soft. Sharper imagery would require higher-resolution source (e.g. PlanetScope 3 m).</p>
            )}
            {selectedFrame?.cloudHint && <p>{selectedFrame.cloudHint}</p>}
          </div>
        )}

        {/* Thumbnails: scaled sizes, images object-contain */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Years</p>
          <div className="flex overflow-x-auto pb-1" style={{ gap: s(8) }}>
            {thumbnailYears.map((y) => {
              const frame = years.find((f) => f.year === y)
              const thumbUrl = frame?.imageUrl ?? null
              const active = y === selectedYear
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`relative flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    active
                      ? 'border-primary ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                      : 'border-transparent hover:border-primary/50 bg-muted/30'
                  }`}
                  style={{ width: s(80), height: s(56) }}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={String(y)} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <Loader2 style={{ width: s(20), height: s(20) }} className="animate-spin text-muted-foreground shrink-0" />
                    </div>
                  )}
                  <span
                    className="absolute bottom-0 left-0 right-0 bg-black/75 text-center font-medium text-white"
                    style={{ paddingTop: sy(2), paddingBottom: sy(2), fontSize: s(10) }}
                  >
                    {y}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
