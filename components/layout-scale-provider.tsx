'use client'

import { LayoutScaleProvider as Provider, DebugLayoutOverlay } from '@/lib/layout-scale'

export function LayoutScaleProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider>
      {children}
      <DebugLayoutOverlay />
    </Provider>
  )
}
