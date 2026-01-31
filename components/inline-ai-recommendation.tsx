'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Sparkles, 
  AlertTriangle, 
  Droplets, 
  Leaf, 
  TrendingUp, 
  Loader2, 
  RefreshCw,
  CheckCircle,
  Target,
  ChevronUp,
  ChevronDown,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { GeminiResponse, RegionData } from '@/lib/gemini'
import { useLanguage } from '@/lib/language-context'

interface InlineAIRecommendationProps {
  regionData: Partial<RegionData>
  isHighRisk?: boolean
}

// Hook to manage AI recommendation state. Pass language so Gemini responds in selected language.
export function useAIRecommendation(regionData: Partial<RegionData>, language?: string) {
  const { language: contextLang } = useLanguage()
  const lang = language ?? contextLang
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recommendation, setRecommendation] = useState<GeminiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:8000'

  const fetchRecommendation = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBase}/dashboard/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regionData, language: lang })
      })

      if (!response.ok) {
        throw new Error('Failed to get recommendation')
      }

      const data = await response.json()
      setRecommendation(data)
    } catch (err) {
      setError('Failed to generate recommendation. Please try again.')
      console.error('AI Recommendation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    if (!isOpen) {
      setIsOpen(true)
      if (!recommendation && !loading) {
        fetchRecommendation()
      }
    } else {
      setIsOpen(false)
    }
  }

  const close = () => setIsOpen(false)
  const refresh = () => fetchRecommendation()

  return {
    isOpen,
    loading,
    recommendation,
    error,
    toggle,
    close,
    refresh,
  }
}

// Trigger Button Component
interface AIRecommendationTriggerProps {
  isOpen: boolean
  isHighRisk?: boolean
  onToggle: () => void
  fullWidth?: boolean
}

export function AIRecommendationTrigger({ isOpen, isHighRisk = false, onToggle, fullWidth = false }: AIRecommendationTriggerProps) {
  return (
    <Button
      onClick={onToggle}
      className={`
        flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium
        transition-all duration-200
        ${fullWidth ? 'w-full h-12' : ''}
        ${isOpen 
          ? 'bg-[#059669] text-white hover:bg-[#047857]' 
          : 'bg-[#10B981] text-white hover:bg-[#059669]'
        }
        shadow-[0_4px_14px_0_rgba(16,185,129,0.25)]
        hover:shadow-[0_10px_25px_-3px_rgba(16,185,129,0.3)]
        ${isHighRisk && !isOpen ? 'animate-pulse' : ''}
      `}
    >
      <Sparkles className="w-5 h-5" />
      <span className="font-semibold">AI Recommendations</span>
      {isHighRisk && !isOpen && (
        <span className="bg-white text-[#10B981] text-xs px-2 py-0.5 rounded-full font-semibold ml-1">
          Action Needed
        </span>
      )}
      {isOpen ? (
        <ChevronUp className="w-5 h-5 ml-1 transition-transform" />
      ) : (
        <ChevronDown className="w-5 h-5 ml-1 transition-transform" />
      )}
    </Button>
  )
}

// Expandable Content Component
interface AIRecommendationContentProps {
  isOpen: boolean
  loading: boolean
  error: string | null
  recommendation: GeminiResponse | null
  regionData: Partial<RegionData>
  onClose: () => void
  onRefresh: () => void
}

export function AIRecommendationContent({
  isOpen,
  loading,
  error,
  recommendation,
  regionData,
  onClose,
  onRefresh,
}: AIRecommendationContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Scroll into view when opening
  useEffect(() => {
    if (isOpen && contentRef.current) {
      setTimeout(() => {
        contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 150)
    }
  }, [isOpen])

  return (
    <div 
      ref={contentRef}
      className={`
        overflow-hidden transition-all duration-500 ease-out
        ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
      `}
    >
      <Card className={`
        border-[#10B981]/30 shadow-lg overflow-hidden
        transition-all duration-500
        ${isOpen ? 'animate-in slide-in-from-top-4 fade-in' : ''}
      `}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#10B981] to-[#059669] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">AI Agricultural Advisor</h3>
              <p className="text-white/90 text-sm">
                {regionData.region_name || 'Region'}, {regionData.country || 'Uzbekistan'} • {regionData.crop || 'Crop'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onRefresh}
              disabled={loading}
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-white/20"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-white hover:text-white hover:bg-white/20 rounded-lg"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 bg-white dark:bg-gray-900">
          {loading && <LoadingState />}
          {error && <ErrorState error={error} onRetry={onRefresh} />}
          {recommendation && !loading && (
            <RecommendationDisplay 
              recommendation={recommendation} 
              regionData={regionData} 
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            Powered by Gemini AI • Satellite data verified
          </p>
          <Button
            onClick={onClose}
            variant="outline"
            size="sm"
            className="text-gray-600 hover:text-gray-800"
          >
            Collapse
            <ChevronUp className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </Card>
    </div>
  )
}

// Legacy combined component for backward compatibility
export function InlineAIRecommendation({ regionData, isHighRisk = false }: InlineAIRecommendationProps) {
  const {
    isOpen,
    loading,
    recommendation,
    error,
    toggle,
    close,
    refresh,
  } = useAIRecommendation(regionData)

  return (
    <div className="flex flex-col">
      <AIRecommendationTrigger 
        isOpen={isOpen} 
        isHighRisk={isHighRisk} 
        onToggle={toggle} 
      />
      <div className={isOpen ? 'mt-6' : ''}>
        <AIRecommendationContent
          isOpen={isOpen}
          loading={loading}
          error={error}
          recommendation={recommendation}
          regionData={regionData}
          onClose={close}
          onRefresh={refresh}
        />
      </div>
    </div>
  )
}

// Loading State Component
function LoadingState() {
  const steps = ['Processing NDVI data', 'Analyzing weather patterns', 'Calculating risk factors', 'Generating advice']
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < steps.length - 1 ? prev + 1 : prev))
    }, 800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-16 h-16 rounded-full bg-[#D1FAE5] flex items-center justify-center mb-4">
        <Loader2 className="w-8 h-8 text-[#10B981] animate-spin" />
      </div>
      <p className="text-gray-700 dark:text-gray-300 font-medium">Analyzing satellite data...</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Generating personalized recommendations</p>
      
      <div className="mt-6 space-y-2 w-full max-w-xs">
        {steps.map((step, i) => (
          <div 
            key={step} 
            className={`flex items-center gap-2 text-sm transition-all duration-300 ${
              i <= currentStep ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i <= currentStep ? 'bg-[#10B981]' : 'bg-gray-300'
            } ${i === currentStep ? 'animate-pulse scale-125' : ''}`} />
            <span className={i <= currentStep ? 'text-[#10B981]' : 'text-gray-500'}>{step}</span>
            {i < currentStep && <CheckCircle className="w-3 h-3 text-[#10B981] ml-auto" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// Error State Component
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5" />
        <span className="font-medium">Error</span>
      </div>
      <p>{error}</p>
      <Button 
        onClick={onRetry}
        variant="outline"
        size="sm"
        className="mt-3 text-red-700 border-red-300 hover:bg-red-100"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Try again
      </Button>
    </div>
  )
}

// Recommendation Display Component (internal)
function RecommendationDisplay({ 
  recommendation, 
  regionData 
}: { 
  recommendation: GeminiResponse
  regionData: Partial<RegionData>
}) {
  // Check if we have meaningful parsed content (at least 2 sections with 50+ chars)
  const sectionCount = [
    recommendation.riskAssessment,
    recommendation.immediateActions,
    recommendation.seasonalOutlook,
    recommendation.resourceOptimization
  ].filter(s => s && s.length > 50).length;

  const hasParsedContent = sectionCount >= 2;

  return (
    <div className="space-y-4">
      {hasParsedContent ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Risk Assessment */}
          {recommendation.riskAssessment && recommendation.riskAssessment.length > 20 && (
            <Section 
              icon={<AlertTriangle className="w-5 h-5" />}
              title="Risk Assessment"
              variant="red"
              className="animate-in fade-in slide-in-from-left-4 duration-500"
              style={{ animationDelay: '0ms' }}
            >
              <div 
                className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.riskAssessment) }}
              />
            </Section>
          )}

          {/* Immediate Actions */}
          {recommendation.immediateActions && recommendation.immediateActions.length > 20 && (
            <Section 
              icon={<Leaf className="w-5 h-5" />}
              title="Immediate Actions"
              variant="brand"
              className="animate-in fade-in slide-in-from-right-4 duration-500"
              style={{ animationDelay: '100ms' }}
            >
              <div 
                className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.immediateActions) }}
              />
            </Section>
          )}

          {/* Seasonal Outlook */}
          {recommendation.seasonalOutlook && recommendation.seasonalOutlook.length > 20 && (
            <Section 
              icon={<TrendingUp className="w-5 h-5" />}
              title="Seasonal Outlook"
              variant="blue"
              className="animate-in fade-in slide-in-from-left-4 duration-500"
              style={{ animationDelay: '200ms' }}
            >
              <div 
                className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.seasonalOutlook) }}
              />
            </Section>
          )}

          {/* Resource Optimization */}
          {recommendation.resourceOptimization && recommendation.resourceOptimization.length > 20 && (
            <Section 
              icon={<Droplets className="w-5 h-5" />}
              title="Resource Optimization"
              variant="cyan"
              className="animate-in fade-in slide-in-from-right-4 duration-500"
              style={{ animationDelay: '300ms' }}
            >
              <div 
                className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.resourceOptimization) }}
              />
            </Section>
          )}
        </div>
      ) : (
        /* Fallback: Show raw response in formatted way */
        <Section 
          icon={<Sparkles className="w-5 h-5" />}
          title="AI Analysis"
          variant="brand"
        >
          <div 
            className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.raw || 'No recommendations available.') }}
          />
        </Section>
      )}

      {/* Data Summary */}
      <Card className="bg-gray-50 dark:bg-gray-800 border-0 p-4 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '400ms' }}>
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Based on satellite data:
        </h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          <Stat label="NDVI" value={regionData.NDVI?.toFixed(2) || 'N/A'} />
          <Stat label="Anomaly" value={regionData.NDVI_anomaly ? `${(regionData.NDVI_anomaly * 100).toFixed(0)}%` : 'N/A'} />
          <Stat label="Precip" value={regionData.precipitation_total_mm ? `${regionData.precipitation_total_mm.toFixed(0)}mm` : 'N/A'} />
          <Stat label="Temp" value={regionData.temperature_mean_C ? `${regionData.temperature_mean_C.toFixed(1)}°C` : 'N/A'} />
        </div>
      </Card>
    </div>
  )
}

// Section Component
interface SectionProps {
  icon: React.ReactNode
  title: string
  variant: 'brand' | 'red' | 'blue' | 'cyan'
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

function Section({ icon, title, variant, children, className = '', style }: SectionProps) {
  const variantClasses = {
    brand: {
      border: 'border-[#10B981]',
      bg: 'bg-[#D1FAE5]/50 dark:bg-[#10B981]/10',
      icon: 'text-[#10B981]',
    },
    red: {
      border: 'border-red-500',
      bg: 'bg-red-50/50 dark:bg-red-950/30',
      icon: 'text-red-500',
    },
    blue: {
      border: 'border-blue-500',
      bg: 'bg-blue-50/50 dark:bg-blue-950/30',
      icon: 'text-blue-500',
    },
    cyan: {
      border: 'border-cyan-500',
      bg: 'bg-cyan-50/50 dark:bg-cyan-950/30',
      icon: 'text-cyan-500',
    },
  }

  const classes = variantClasses[variant]

  return (
    <div 
      className={`border-l-4 ${classes.border} ${classes.bg} rounded-r-lg p-4 h-full ${className}`}
      style={style}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={classes.icon}>{icon}</span>
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// Stat Component
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

// Improved Markdown formatter
function formatMarkdown(text: string): string {
  if (!text) return ''
  
  let result = text
    // Section headers with numbers: **1. RISK ASSESSMENT**
    .replace(/\*\*(\d+)\.\s*([A-Z][A-Z\s]+)\*\*/g, '<h3 class="font-bold text-[#10B981] text-base mt-4 mb-2 border-b border-[#10B981]/20 pb-1">$2</h3>')
    // Regular headers
    .replace(/^### (.*?)$/gm, '<h4 class="font-semibold text-base mt-3 mb-1">$1</h4>')
    .replace(/^## (.*?)$/gm, '<h3 class="font-semibold text-lg mt-4 mb-2">$1</h3>')
    // Bold headers without numbers
    .replace(/\*\*([A-Z][A-Z\s]+)\*\*:?/g, '<h4 class="font-semibold text-sm text-gray-800 dark:text-gray-200 mt-3 mb-1">$1</h4>')
    // Regular bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Credit recommendation highlight
    .replace(/(Credit recommendation:.*?)(?=\n|$)/gi, '<span class="block mt-2 p-2 bg-[#10B981]/10 rounded text-[#10B981] font-medium">$1</span>')
    // Emoji preservation
    .replace(/(🚨|⚠️|🔴|🟠|🟢|⚪|📈|📉|✅|❌|💧|🌾|☀️|🌡️|⛔|🌱|💰)/g, '<span class="text-lg inline-block mr-1">$1</span>')
    // Bullet lists (must be before line breaks)
    .replace(/^[•\-\*]\s+(.*?)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Numbered lists  
    .replace(/^(\d+)\.\s+(?![A-Z]{2})(.*?)$/gm, '<li class="ml-4 list-decimal">$2</li>')
  
  // Wrap consecutive list items
  result = result.replace(/(<li[^>]*class="[^"]*list-disc[^"]*"[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ul class="space-y-1 my-2 list-disc">${match}</ul>`
  })
  result = result.replace(/(<li[^>]*class="[^"]*list-decimal[^"]*"[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ol class="space-y-1 my-2 list-decimal">${match}</ol>`
  })
  
  // Paragraphs
  result = result
    .replace(/\n\n+/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>')
  
  // Wrap in paragraph
  if (!result.startsWith('<')) {
    result = `<p>${result}</p>`
  }
  
  return result
}

export default InlineAIRecommendation
