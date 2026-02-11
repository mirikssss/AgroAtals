'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import type {
  KpiExplainStructuredResponse,
  BadgeTone,
  PriorityLevel,
} from '@/lib/kpi-explain-types'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const priorityClasses: Record<PriorityLevel, string> = {
  P0: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300',
  P1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300',
  P2: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-300',
}

interface KpiExplainModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  error: string | null
  data: KpiExplainStructuredResponse | null
  onRetry: () => void
  /** Card label for loading/error title */
  cardTitle?: string
}

export function KpiExplainModal({
  open,
  onOpenChange,
  loading,
  error,
  data,
  onRetry,
  cardTitle = 'KPI',
}: KpiExplainModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-[95vw] sm:w-[min(720px,50vw)] max-w-[calc(100vw-2rem)] max-h-[min(80vh,700px)] overflow-hidden flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col overflow-auto flex-1 min-h-0 p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>{data?.title || cardTitle}</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading explanation…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertTriangle className="w-12 h-12 text-amber-500" />
              <p className="text-sm text-center text-muted-foreground max-w-sm">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          )}

          {data && !loading && !error && (
            <KpiExplainRenderer data={data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KpiExplainRenderer({ data }: { data: KpiExplainStructuredResponse }) {
  return (
    <div className="space-y-6">
      {/* Title + subtitle */}
      <div>
        <h2 className="text-xl font-bold text-foreground">{data.title}</h2>
        {data.subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{data.subtitle}</p>
        )}
      </div>

      {/* Badges */}
      {data.badges?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.badges.map((b, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${toneClasses[b.tone] ?? toneClasses.neutral}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Hero */}
      {data.hero && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-lg font-semibold text-foreground">{data.hero.headline}</p>
          {data.hero.summary && (
            <p className="text-sm text-muted-foreground mt-1">{data.hero.summary}</p>
          )}
        </div>
      )}

      {/* Metrics — 2 columns, value large and bold */}
      {data.metrics?.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {data.metrics.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${m.tone === 'danger' ? 'border-red-200 dark:border-red-800' : m.tone === 'warning' ? 'border-amber-200 dark:border-amber-800' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{m.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${m.tone === 'danger' ? 'text-red-600 dark:text-red-400' : m.tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : m.tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                {m.value}{m.unit != null ? ` ${m.unit}` : ''}
              </p>
              {m.note && <p className="text-xs text-muted-foreground mt-1">{m.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Sections (bullets) */}
      {data.sections?.length > 0 && (
        <div className="space-y-4">
          {data.sections.map((sec, i) => (
            <div key={i}>
              <h3 className="text-sm font-semibold text-foreground mb-2">{sec.heading}</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {sec.bullets?.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {data.table && data.table.rows?.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-foreground px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            {data.table.title}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                {data.table.columns?.map((c, i) => (
                  <th key={i} className="text-left font-medium px-3 py-2">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.table.rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confidence */}
      {data.confidence && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          {data.confidence.level === 'high' ? (
            <AlertCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{data.confidence.reason}</p>
            {data.confidence.limitations?.length > 0 && (
              <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                {data.confidence.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Next actions — checklist with priority */}
      {data.next_actions?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Recommended actions</h3>
          <ul className="space-y-2">
            {data.next_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${priorityClasses[a.priority]}`}>
                  {a.priority}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.action}</p>
                  {a.why && <p className="text-xs text-muted-foreground">{a.why}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      {data.disclaimer && (
        <p className="text-xs text-muted-foreground border-t border-slate-200 dark:border-slate-700 pt-3">
          {data.disclaimer}
        </p>
      )}
    </div>
  )
}
