// app/api/forecast/route.ts
import { NextResponse } from 'next/server'

const FORECAST_URL = process.env.NEXT_PUBLIC_FORECAST_URL

type ForecastRequestBody = {
  user_expenses: number[]
  user_dates: string[]
}

// helper: Date -> "YYYY-MM-DD"
function toDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeHorizonDates(user_dates: string[], horizon: number) {
  const lastDateStr = user_dates[user_dates.length - 1]
  const lastDate = new Date(lastDateStr)
  lastDate.setHours(0, 0, 0, 0)

  const horizon_dates: string[] = []
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(lastDate)
    d.setDate(lastDate.getDate() + i)
    horizon_dates.push(toDateKey(d))
  }
  return horizon_dates
}

export async function POST(req: Request) {
  try {
    if (!FORECAST_URL) {
      return NextResponse.json(
        { error: 'FORECAST_URL is not set on the server.' },
        { status: 500 },
      )
    }

    const body = (await req.json())

    if (
      !Array.isArray(body.user_expenses) ||
      !Array.isArray(body.user_dates) ||
      body.user_expenses.length !== body.user_dates.length ||
      body.user_expenses.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'user_expenses and user_dates must be non-empty arrays of equal length',
        },
        { status: 400 },
      )
    }

    const { user_expenses, user_dates } = body
    const horizon = 30
    const horizon_dates = computeHorizonDates(user_dates, horizon)

    // ✅ call external forecast service (NO fallback)
    const externalRes = await fetch(FORECAST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_expenses, user_dates }),
    })

    const contentType = externalRes.headers.get('content-type') || ''

    // If external is non-JSON, return its raw text as error context
    if (!contentType.includes('application/json')) {
      const txt = await externalRes.text()
      console.error('[forecast] non-JSON from external:', {
        status: externalRes.status,
        contentType,
        body: txt.slice(0, 800),
      })
      return NextResponse.json(
        {
          error: 'Forecast API returned non-JSON response.',
          status: externalRes.status,
          contentType,
          bodyPreview: txt.slice(0, 800),
        },
        { status: 502 },
      )
    }

    const raw = await externalRes.json()

    if (!externalRes.ok) {
      console.error('[forecast] external error:', externalRes.status, raw)
      return NextResponse.json(
        {
          error: 'Forecast API returned an error status.',
          status: externalRes.status,
          raw,
        },
        { status: 502 },
      )
    }

    // ✅ normalize forecast array (still required because external could wrap it)
    // normalize forecast array
    let forecast: any = null

    if (Array.isArray(raw)) forecast = raw
    else if (Array.isArray(raw?.body)) forecast = raw.body           // ✅ ADD THIS
    else if (Array.isArray(raw?.forecast)) forecast = raw.forecast
    else if (Array.isArray(raw?.values)) forecast = raw.values
    else if (Array.isArray(raw?.predictions)) forecast = raw.predictions

    if (!forecast) {
      return NextResponse.json(
        { error: 'Forecast response JSON did not include a forecast array.', raw },
        { status: 502 },
      )
    }

    // ensure numeric
    const cleaned = forecast
      .map((x: any) => Number(x))
      .filter((x: any) => Number.isFinite(x))

    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'Forecast array contained no numeric values.', raw },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        forecast: cleaned,               // ✅ now populated
        horizon_dates,
        input: { user_expenses, user_dates },
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('[forecast] route error:', e)
    return NextResponse.json(
      { error: e?.message || 'Unexpected error in /api/forecast.' },
      { status: 500 },
    )
  }
}