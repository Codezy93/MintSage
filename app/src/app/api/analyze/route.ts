import { verifiedUser } from '@/lib/supabase/verified-user'
// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

import { runEDA } from '@/lib/transactions/analysis'
import type { TransactionRecord } from '@/types/transactions'

type AnalyzeRequestBody = {
  transactions: TransactionRecord[]
  forecast: number[]
  question: string
}

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
  lines.push(`Forecast mean: ${eda.forecastSummary.mean}`)
  lines.push(`Forecast trend: ${eda.forecastSummary.trend}`)
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
    if (!await verifiedUser()) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY or GOOGLE_API_KEY is not set on the server',
        },
        { status: 500 },
      )
    }

    const body = (await req.json()) as AnalyzeRequestBody

    if (
      !Array.isArray(body.transactions) ||
      body.transactions.length === 0
    ) {
      return NextResponse.json(
        { error: 'transactions array is required and non-empty' },
        { status: 400 },
      )
    }

    const forecastArray = Array.isArray(body.forecast)
      ? body.forecast
      : []

    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json(
        { error: 'question is required' },
        { status: 400 },
      )
    }

    const eda = runEDA(body.transactions, forecastArray)
    const prompt = buildPrompt(eda, body.question)

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    const answer = response.text ?? ''

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