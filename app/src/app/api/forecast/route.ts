import { verifiedUser } from '@/lib/supabase/verified-user'
// app/api/forecast/route.ts
import { NextResponse } from 'next/server'

const FORECAST_URL = process.env.FORECAST_URL

// helper: Date -> "YYYY-MM-DD"
function toDateKey(date: Date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeHorizonDates(user_dates: string[], horizon: number) {
  const lastDateStr = user_dates[user_dates.length - 1]
  const lastDate = new Date(lastDateStr)
  lastDate.setUTCHours(0, 0, 0, 0)

  const horizon_dates: string[] = []
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(lastDate)
    d.setUTCDate(lastDate.getUTCDate() + i)
    horizon_dates.push(toDateKey(d))
  }
  return horizon_dates
}

export async function POST(req: Request) {
  try {
    if (!await verifiedUser()) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
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

    if (!externalRes.ok || !externalRes.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json({ error: 'Forecast service unavailable' }, { status: 502 })
    }
    const raw = await externalRes.json()

    // ✅ normalize forecast array (still required because external could wrap it)
    // normalize forecast array
    let forecast: unknown[] | null = null

    if (Array.isArray(raw)) forecast = raw
    else if (Array.isArray(raw?.body)) forecast = raw.body           // ✅ ADD THIS
    else if (Array.isArray(raw?.forecast)) forecast = raw.forecast
    else if (Array.isArray(raw?.values)) forecast = raw.values
    else if (Array.isArray(raw?.predictions)) forecast = raw.predictions

    if (!forecast) {
      return NextResponse.json(
        { error: 'Forecast response JSON did not include a forecast array.' },
        { status: 502 },
      )
    }

    // ensure numeric
    const cleaned = forecast
      .map((x) => Number(x))
      .filter(Number.isFinite)

    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'Forecast array contained no numeric values.' },
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
  } catch {
    return NextResponse.json(
      { error: 'Unexpected error in /api/forecast.' },
      { status: 500 },
    )
  }
}
