'use client'

import React, { useState } from 'react'
import { 
  Sparkles, 
  AlertTriangle, 
  Droplets, 
  Leaf, 
  TrendingUp, 
  Loader2, 
  RefreshCw,
  CheckCircle,
  Target
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { GeminiResponse, RegionData } from '@/lib/gemini'

interface AIRecommendationProps {
  regionData: Partial<RegionData>
  isHighRisk?: boolean
  compact?: boolean
}

export function AIRecommendation({ regionData, isHighRisk = false, compact = false }: AIRecommendationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recommendation, setRecommendation] = useState<GeminiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchRecommendation = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regionData)
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && !recommendation) {
      fetchRecommendation()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          className={`
            flex items-center gap-2 ${compact ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5'} rounded-lg font-medium
            transition-all duration-200
            bg-[#10B981] text-white hover:bg-[#059669]
            shadow-[0_4px_14px_0_rgba(16,185,129,0.25)]
            hover:shadow-[0_10px_25px_-3px_rgba(16,185,129,0.3)]
            ${isHighRisk ? 'animate-pulse' : ''}
          `}
        >
          <Sparkles className="w-4 h-4" />
          {compact ? 'AI Insight' : 'AI Recommendations'}
          {isHighRisk && !compact && (
            <span className="bg-white text-[#10B981] text-xs px-2 py-0.5 rounded-full font-semibold">
              Action Needed
            </span>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0"
        showCloseButton={false}
      >
        {/* Custom Header with Brand Color */}
        <div className="bg-[#10B981] p-4 flex items-center justify-between rounded-t-lg">
          <DialogHeader className="text-white gap-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white">
                  AI Agricultural Advisor
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm">
                  {regionData.region_name || 'Region'}, {regionData.country || 'Uzbekistan'} • {regionData.crop || 'Crop'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <Button 
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="text-white hover:bg-white/20 rounded-lg"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading && <LoadingState />}
          {error && <ErrorState error={error} onRetry={fetchRecommendation} />}
          {recommendation && !loading && (
            <RecommendationContent 
              recommendation={recommendation} 
              regionData={regionData} 
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center rounded-b-lg">
          <p className="text-xs text-gray-400">
            Powered by Gemini AI • Satellite data verified
          </p>
          <Button
            onClick={fetchRecommendation}
            disabled={loading}
            variant="ghost"
            size="sm"
            className="text-[#10B981] hover:text-[#059669] hover:bg-[#D1FAE5]"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            Regenerate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Loading State Component
function LoadingState() {
  const steps = ['Processing NDVI data', 'Analyzing weather patterns', 'Calculating risk factors', 'Generating advice']
  const [currentStep, setCurrentStep] = useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < steps.length - 1 ? prev + 1 : prev))
    }, 800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-16 h-16 rounded-full bg-[#D1FAE5] flex items-center justify-center mb-4">
        <Loader2 className="w-8 h-8 text-[#10B981] animate-spin" />
      </div>
      <p className="text-gray-700 dark:text-gray-300 font-medium">Analyzing satellite data...</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Generating personalized recommendations</p>
      
      <div className="mt-6 space-y-2 w-full max-w-xs">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2 text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full ${i <= currentStep ? 'bg-[#10B981]' : 'bg-gray-300'} ${i === currentStep ? 'animate-pulse' : ''}`} />
            <span className={i <= currentStep ? 'text-[#10B981]' : ''}>{step}</span>
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

// Recommendation Content Component
function RecommendationContent({ 
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
    <div className="space-y-6">
      {hasParsedContent ? (
        <>
          {/* Risk Assessment */}
          {recommendation.riskAssessment && recommendation.riskAssessment.length > 20 && (
            <Section 
              icon={<AlertTriangle className="w-5 h-5" />}
              title="Risk Assessment"
              variant="red"
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
            >
              <div 
                className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(recommendation.resourceOptimization) }}
              />
            </Section>
          )}
        </>
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
      <Card className="bg-gray-50 dark:bg-gray-800 border-0 p-4 mt-6">
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
}

function Section({ icon, title, variant, children }: SectionProps) {
  const variantClasses = {
    brand: {
      border: 'border-[#10B981]',
      bg: 'bg-[#D1FAE5] dark:bg-[#10B981]/10',
      icon: 'text-[#10B981]',
    },
    red: {
      border: 'border-red-500',
      bg: 'bg-red-50 dark:bg-red-950/30',
      icon: 'text-red-500',
    },
    blue: {
      border: 'border-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      icon: 'text-blue-500',
    },
    cyan: {
      border: 'border-cyan-500',
      bg: 'bg-cyan-50 dark:bg-cyan-950/30',
      icon: 'text-cyan-500',
    },
  }

  const classes = variantClasses[variant]

  return (
    <div className={`border-l-4 ${classes.border} ${classes.bg} rounded-r-lg p-4`}>
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

export default AIRecommendation
