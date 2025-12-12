// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export type TransactionRecord = {
  id: string
  created_at: string
  amount: number
  vendor: string
  category: string
}

type AnalyzeRequestBody = {
  transactions: TransactionRecord[]
  forecast: number[]
  question: string
}

const GEMINI_API_KEY =
  process.env.NEXT_PUBLIC_GEMINI_API_KEY

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
})

// simple intense-ish EDA
function runEDA(transactions: TransactionRecord[], forecast: number[]) {
  const txSorted = [...transactions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime(),
  )

  // 👉 Income = negative values (reported positive)
  const totalIncome = txSorted
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + -t.amount, 0)

  // 👉 Expense = positive values
  const totalExpense = txSorted
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  // 👉 Net = income - expense
  const totalNet = totalIncome - totalExpense

  // ----- Daily net series (income positive, expense negative) -----
  const dateMap = new Map<string, number>()
  for (const t of txSorted) {
    const key = t.created_at.split('T')[0]

    // canonical: income (+), expense (−)
    const delta = -t.amount
    dateMap.set(key, (dateMap.get(key) ?? 0) + delta)
  }

  const daily = [...dateMap.entries()]
    .sort(
      (a, b) =>
        new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    )
    .map(([date, value]) => ({ date, value }))

  const dailyVals = daily.map((d) => d.value)

  // ----- Volatility + trend on net daily values -----
  let volatility = 0
  let slope = 0
  let trend: 'increasing' | 'decreasing' | 'flat' = 'flat'

  if (dailyVals.length > 1) {
    const mean =
      dailyVals.reduce((a, b) => a + b, 0) / dailyVals.length
    const variance =
      dailyVals.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
      dailyVals.length
    volatility = Math.sqrt(variance)

    const xs = dailyVals.map((_, i) => i)
    const ys = dailyVals
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length
    let num = 0
    let den = 0
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean)
      den += (xs[i] - xMean) ** 2
    }
    slope = den === 0 ? 0 : num / den
    if (slope > 0) trend = 'increasing'
    else if (slope < 0) trend = 'decreasing'
  }

  // ----- Category stats (net, using same delta sign) -----
  const catMap = new Map<
    string,
    { sum: number; count: number; max: number }
  >()
  for (const t of txSorted) {
    const prev =
      catMap.get(t.category) ?? {
        sum: 0,
        count: 0,
        max: -Infinity,
      }
    const delta = -t.amount // income +, expense −
    prev.sum += delta
    prev.count += 1
    prev.max = Math.max(prev.max, delta)
    catMap.set(t.category, prev)
  }

  const categoryStats = [...catMap.entries()].map(
    ([category, v]) => ({
      category,
      sum: v.sum,    // positive → net inflow, negative → net outflow
      count: v.count,
      max: v.max,
    }),
  )

  // ----- Forecast summary (unchanged) -----
  let forecastMean = 0
  let forecastTrend: 'upward' | 'downward' | 'flat' = 'flat'
  if (forecast.length > 0) {
    forecastMean =
      forecast.reduce((a, b) => a + b, 0) / forecast.length
    if (forecast[forecast.length - 1] > forecast[0])
      forecastTrend = 'upward'
    else if (forecast[forecast.length - 1] < forecast[0])
      forecastTrend = 'downward'
  }

  return {
    totals: {
      totalNet,
      totalIncome,
      totalExpense,
      avgDaily:
        dailyVals.length > 0
          ? totalNet / dailyVals.length
          : 0,
    },
    volatility,
    trend: {
      slope,
      direction: trend,
    },
    daily,
    categoryStats,
    forecastSummary: {
      mean: forecastMean,
      trend: forecastTrend,
    },
  }
}

function buildPrompt(eda: any, question: string): string {
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
  lines.push('=== FORECAST SUMMARY ===')
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    const answer = (response as any).text ?? ''

    return NextResponse.json({ eda, answer })
  } catch (e: any) {
    console.error('[analyze] error:', e)
    return NextResponse.json(
      { error: 'Internal error while analyzing data' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}