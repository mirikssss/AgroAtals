'use client'

/**
 * Layout context: breakpoint, viewport size, safe area.
 * NO global scaling or letterboxing. Use for responsive layout structure only.
 * Design baseline: 360px min width; UI expands with responsive rules (max-width, columns).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

/** Minimum layout width baseline (design reference) */
export const REF_W = 360

export type Breakpoint = 'compact' | 'regular' | 'expanded'

const BP_COMPACT = 640
const BP_REGULAR = 1024

export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface LayoutState {
  width: number
  height: number
  breakpoint: Breakpoint
  safeArea: SafeAreaInsets
  /** Identity shim: no scaling. Use rem/clamp() or responsive classes for sizing. */
  s: (value: number) => number
  sx: (value: number) => number
  sy: (value: number) => number
  refW: number
}

const defaultState: LayoutState = {
  width: REF_W,
  height: 800,
  breakpoint: 'regular',
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  s: (v) => v,
  sx: (v) => v,
  sy: (v) => v,
  refW: REF_W,
}

const LayoutContext = createContext<LayoutState>(defaultState)

function getBreakpoint(width: number): Breakpoint {
  if (width < BP_COMPACT) return 'compact'
  if (width < BP_REGULAR) return 'regular'
  return 'expanded'
}

/** Safe area not available in JS on web; use env(safe-area-inset-*) in CSS (e.g. .appShell). */
function getSafeArea(): SafeAreaInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

export function LayoutScaleProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LayoutState>(() => {
    if (typeof window === 'undefined') return defaultState
    const w = window.innerWidth
    const h = window.innerHeight
    return {
      ...defaultState,
      width: w,
      height: h,
      breakpoint: getBreakpoint(w),
      safeArea: getSafeArea(),
    }
  })

  const update = useCallback(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    setState({
      width: w,
      height: h,
      breakpoint: getBreakpoint(w),
      safeArea: getSafeArea(),
      s: (v) => v,
      sx: (v) => v,
      sy: (v) => v,
      refW: REF_W,
    })
    document.documentElement.style.setProperty('--layout-width', String(w))
    document.documentElement.style.setProperty('--layout-height', String(h))
    document.documentElement.style.setProperty('--layout-ref-w', `${REF_W}px`)
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return (
    <LayoutContext.Provider value={state}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayoutScale(): LayoutState {
  const ctx = useContext(LayoutContext)
  return ctx ?? defaultState
}

/** For images/canvas: preserve aspect ratio, use object-fit: contain */
export const IMAGE_FIT = 'contain' as const

const DEBUG_LAYOUT = process.env.NEXT_PUBLIC_DEBUG_LAYOUT === 'true'

export function DebugLayoutOverlay() {
  const layout = useLayoutScale()
  if (!DEBUG_LAYOUT) return null
  return (
    <div
      className="fixed bottom-2 left-2 right-2 z-[9999] pointer-events-none flex justify-center"
      aria-hidden
    >
      <div className="px-3 py-2 rounded-lg bg-black/80 text-white text-xs font-mono shadow-lg">
        <span className="mr-3">viewport: {layout.width}×{layout.height}</span>
        <span>breakpoint: {layout.breakpoint}</span>
      </div>
    </div>
  )
}
