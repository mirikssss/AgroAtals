import { NextRequest, NextResponse } from 'next/server'
import { getKpiExplanation, type KpiCardId, type KpiExplainMetrics } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const hasKey = !!(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY)
    console.log('[explain-kpi] POST request, GEMINI_API_KEY set:', hasKey)

    const body = await request.json()
    const { cardId, ...metrics } = body as { cardId: KpiCardId } & KpiExplainMetrics

    if (!cardId || !['portfolio', 'yield', 'confidence'].includes(cardId)) {
      return NextResponse.json(
        { error: 'cardId is required and must be portfolio, yield, or confidence' },
        { status: 400 }
      )
    }

    const { explanation, isMock } = await getKpiExplanation(cardId, metrics ?? {})
    return NextResponse.json({ explanation, isMock })
  } catch (error) {
    console.error('explain-kpi API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate explanation' },
      { status: 500 }
    )
  }
}
