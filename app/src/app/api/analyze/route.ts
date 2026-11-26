import { verifiedUser } from '@/lib/supabase/verified-user'
// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

import { runEDA } from '@/lib/transactions/analysis'
import { analysisRequest } from '@/lib/transactions/contracts'
import { z } from 'zod'
import { answerPlanning, planningIntent } from '@/lib/planning/questions'

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY



function buildPrompt(eda: ReturnType<typeof runEDA>, question: string): string {
  const lines: string[] = []

  lines.push('You are a financial analysis assistant.')
  lines.push(
    'Use the EDA below to answer the user question with clear pros and cons and actionable tips.',
  )
  lines.push('')
  lines.push('=== TOTALS ===')
  lines.push(`Total net: ${eda.totals.totalNet}`)
  lines.push(`Income: ${eda.totals.totalIncome}`)
  lines.push(`Expense: ${eda.totals.totalExpense}`)
  lines.push(`Average daily net: ${eda.totals.avgDaily}`)
  lines.push('')
  lines.push('=== VOLATILITY & TREND ===')
  lines.push(`Volatility (std dev): ${eda.volatility}`)
  lines.push(
    `Trend: ${eda.trend.direction} (slope ${eda.trend.slope})`,
  )
  lines.push('')
  lines.push('=== TOP CATEGORIES ===')
  const sortedCats = [...eda.categoryStats].sort(
    (a, b) => Math.abs(b.sum) - Math.abs(a.sum),
  )
  for (const c of sortedCats.slice(0, 5)) {
    lines.push(
      `- ${c.category}: sum=${c.sum}, count=${c.count}, max=${c.max}`,
    )
  }
  lines.push('')
  lines.push('=== EXPERIMENTAL FORECAST SUMMARY (accuracy unvalidated) ===')
  if (eda.forecastSummary) {
    lines.push(`Forecast mean: ${eda.forecastSummary.mean}`)
    lines.push(`Forecast trend: ${eda.forecastSummary.trend}`)
  } else {
    lines.push('Forecast unavailable.')
  }
  lines.push('')
  lines.push('=== USER QUESTION ===')
  lines.push(question)
  lines.push('')
  lines.push(
    'Answer in 3–7 sentences. Explain good and bad patterns, highlight risks, and give 1–3 concrete actionable suggestions. Do not repeat raw numbers excessively.',
  )

  return lines.join('\n')
}

export async function POST(req: Request) {
  try {
    const user = await verifiedUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const parsed = analysisRequest.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid analysis request' }, { status: 400 })
    const body = parsed.data
    const eda = runEDA(body.transactions, body.forecast)
    if (planningIntent(body.question)) {
      const { planningData } = await import('@/lib/planning/store')
      const { plan, ctx } = await planningData(user.id)
      return NextResponse.json({ eda, answer: answerPlanning(body.question, plan, ctx) })
    }
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'Analysis unavailable' }, { status: 503 })
    const prompt = buildPrompt(eda, body.question)

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    const result = z.string().trim().min(1).safeParse(response.text)
    if (!result.success) return NextResponse.json({ error: 'Analysis unavailable' }, { status: 502 })
    const answer = result.data

    return NextResponse.json({ eda, answer })
  } catch (e: unknown) {
    console.error('[analyze] error:', e)
    return NextResponse.json(
      { error: 'Internal error while analyzing data' },
      { status: 500 },
    )
  }
}

export async function GET() {
  if (!await verifiedUser()) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  return NextResponse.json({ status: 'ok' })
}