import { afterEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/forecast/route'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { buildLast60Days } from '@/lib/transactions/aggregation'
import { runEDA } from '@/lib/transactions/analysis'
import type { TransactionRecord } from '@/types/transactions'

vi.mock('@/lib/supabase/verified-user', () => ({ verifiedUser: vi.fn() }))
const last = new Date('2024-02-29T23:00:00Z')
const purchase: TransactionRecord = {
  id: 'p', date: '2024-02-29', amount: 12, currency: 'USD', accountId: 'a',
  pending: false, pendingId: null, vendor: 'Market', category: 'Food',
  merchantId: null, detailedCategory: null, kind: 'purchase', needsReview: false,
}
const history = buildLast60Days([purchase], last)
const request = (body: unknown) => new Request('http://localhost/api/forecast', {
  method: 'POST', body: JSON.stringify(body),
})
function signedIn() {
  vi.mocked(verifiedUser).mockResolvedValue({ id: 'verified' } as NonNullable<Awaited<ReturnType<typeof verifiedUser>>>)
  vi.stubEnv('AGENT_SERVICE_SECRET', 'fixture')
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('uses 60 UTC days and sums net USD purchases including refunds', () => {
  const rows: TransactionRecord[] = [purchase, { ...purchase, amount: -2, kind: 'refund' },
    { ...purchase, pending: true }, { ...purchase, kind: 'transfer' }, { ...purchase, currency: 'CAD' }]
  const input = buildLast60Days(rows, last)
  expect(input.user_dates[0]).toBe('2024-01-01')
  expect(input.user_dates.at(-1)).toBe('2024-02-29')
  expect(input.user_expenses.at(-1)).toBe(10)
  expect(runEDA(rows, []).totals.totalExpense).toBe(10)
})

it('denies unauthorized requests before calling the service', async () => {
  vi.mocked(verifiedUser).mockResolvedValue(null)
  const downstream = vi.fn()
  vi.stubGlobal('fetch', downstream)
  expect((await POST(request(history))).status).toBe(401)
  expect(downstream).not.toHaveBeenCalled()
})

it('rejects missing or discontinuous history', async () => {
  signedIn()
  expect((await POST(request({ ...history, user_dates: Array(60).fill('2024-01-01') }))).status).toBe(400)
})

it('rejects incomplete forecasts and upstream failures', async () => {
  signedIn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ forecast: [1] }))
    .mockRejectedValueOnce(new Error('offline')))
  expect((await POST(request(history))).status).toBe(502)
  expect((await POST(request(history))).status).toBe(502)
})

it('reports a service timeout', async () => {
  signedIn()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('deadline')))
  expect((await POST(request(history))).status).toBe(504)
})

it('requires a horizon starting the day after the history', async () => {
  signedIn()
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2024, 2, i + 1)).toISOString().slice(0, 10))
  const result = { currency: 'USD', model: 'weekly-seasonal-naive', forecast: Array(30).fill(0), horizon_dates: days }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(result))
    .mockResolvedValueOnce(Response.json({ ...result, horizon_dates: history.user_dates.slice(0, 30) })))
  expect((await (await POST(request(history))).json()).forecast).toEqual(result.forecast)
  expect((await POST(request(history))).status).toBe(502)
})
