import { afterEach, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/planning/route'
import { POST as internal } from '@/app/api/internal/planning/route'
import { planSchema } from '@/lib/planning/types'
import { calculate } from '@/lib/planning/engine'

const services = vi.hoisted(() => ({
  verifiedUser: vi.fn(),
  planningData: vi.fn(),
  savePlan: vi.fn(),
  recordBaseline: vi.fn(),
  records: vi.fn(),
}))
vi.mock('@/lib/supabase/verified-user', () => services)
vi.mock('@/lib/planning/store', () => services)
vi.mock('@/lib/planning/investigator', () => ({ investigate: vi.fn() }))
vi.mock('@/lib/supabase/private', () => ({ privateClient: vi.fn() }))
const owner = '00000000-0000-4000-8000-000000000001'
const plan = planSchema.parse({})
const ctx = {
  today: '2026-02-01',
  historyReady: false,
  issues: [],
  transactions: [],
  accounts: [],
  suggestions: [],
  debts: [],
  observedAt: null,
}
const request = (data: unknown, headers: Record<string, string> = {}) =>
  new Request('https://fixture.invalid', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})
it('requires a verified session before accessing finance records', async () => {
  services.verifiedUser.mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect(
    (await POST(request({ action: 'save', revision: 0, plan }))).status
  ).toBe(401)
  expect(services.planningData).not.toHaveBeenCalled()
  expect(services.savePlan).not.toHaveBeenCalled()
})
it('binds writes to the session, rejects stale revisions and keeps simulations read-only', async () => {
  services.verifiedUser.mockResolvedValue({ id: owner })
  services.savePlan.mockResolvedValue(false)
  expect(
    (
      await POST(
        request({ action: 'save', owner: 'someone-else', revision: 1, plan })
      )
    ).status
  ).toBe(409)
  expect(services.savePlan).toHaveBeenCalledWith(owner, 1, plan)
  services.planningData.mockResolvedValue({
    plan,
    ctx,
    report: calculate(plan, ctx),
    revision: 1,
  })
  const response = await POST(
    request({ action: 'scenario', scenario: { purchase: 50 } })
  )
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(
    result.simulated.calendar[0].outflow - result.baseline.calendar[0].outflow
  ).toBe(50)
  expect(services.recordBaseline).not.toHaveBeenCalled()
  expect(services.savePlan).toHaveBeenCalledTimes(1)
})
it('accepts only authenticated read-only tool calls with a trusted owner header', async () => {
  vi.stubEnv('AGENT_SERVICE_SECRET', 'fixture')
  const headers = { Authorization: 'Bearer fixture', 'X-MintSage-User': owner }
  expect((await internal(request({ view: 'runway' }))).status).toBe(401)
  expect(
    (await internal(request({ view: 'runway', owner: 'another' }, headers)))
      .status
  ).toBe(400)
  services.planningData.mockResolvedValue({
    plan,
    ctx,
    report: calculate(plan, ctx),
    revision: 1,
  })
  const res = await internal(request({ view: 'runway' }, headers))
  expect(res.status).toBe(200)
  expect(services.planningData).toHaveBeenCalledWith(owner, undefined)
  expect((await res.json()).data).toHaveProperty('beforePayday', null)
})
