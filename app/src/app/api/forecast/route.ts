import { NextResponse } from 'next/server'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { forecastRequest, nextDay, projection } from '@/lib/transactions/contracts'

export async function POST(req: Request) {
  const user = await verifiedUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const parsed = forecastRequest.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected 60 consecutive days of USD spending' }, { status: 400 })
  }
  const endpoint = URL.parse(process.env.FORECAST_URL || 'http://127.0.0.1:8000/forecast')
  if (!endpoint) return NextResponse.json({ error: 'Invalid forecast endpoint' }, { status: 503 })
  const secret = process.env.AGENT_SERVICE_SECRET
  const local = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (!secret || (!local && endpoint.protocol !== 'https:')) {
    return NextResponse.json({ error: 'Forecast service configuration unavailable' }, { status: 503 })
  }
  const signal = AbortSignal.timeout(8000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, 'X-MintSage-User': user.id },
      body: JSON.stringify(parsed.data),
    })
    if (!res.ok) throw new Error('Service unavailable')
    const output = projection.parse(await res.json())
    if (!nextDay(parsed.data.user_dates[59], output.horizon_dates[0])) throw new Error('Misaligned horizon')
    return NextResponse.json({ ...output, input: parsed.data })
  } catch {
    return NextResponse.json({ error: signal.aborted ? 'Forecast timed out' : 'Forecast service unavailable' },
      { status: signal.aborted ? 504 : 502 })
  }
}
