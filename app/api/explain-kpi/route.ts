import { NextRequest, NextResponse } from 'next/server'
import { getKpiExplanation, type KpiCardId, type KpiExplainMetrics } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cardId, ...metrics } = body as { cardId: KpiCardId } & KpiExplainMetrics

    if (!cardId || !['portfolio', 'yield', 'confidence'].includes(cardId)) {
      return NextResponse.json(
        { error: 'cardId is required and must be portfolio, yield, or confidence' },
        { status: 400 }
      )
    }

    const explanation = await getKpiExplanation(cardId, metrics ?? {})
    return NextResponse.json({ explanation })
  } catch (error) {
    console.error('explain-kpi API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate explanation' },
      { status: 500 }
    )
  }
}
