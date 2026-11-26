import { expect, it, vi } from 'vitest'
import { readContext } from '@/lib/planning/provider'
const f = vi.hoisted(() => ({
  load: vi.fn(),
  accountsGet: vi.fn(),
  liabilitiesGet: vi.fn(),
  transactionsRecurringGet: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/plaid/config', () => ({ plaidClient: f }))
vi.mock('@/lib/supabase/private', () => ({
  privateClient: () => ({ from: () => ({ select: () => ({ eq: f.load }) }) }),
}))
it('keeps manual planning available when provider products are unavailable', async () => {
  vi.stubEnv('PLAID_RECURRING_ENABLED', 'true')
  vi.stubEnv('PLAID_LIABILITIES_ENABLED', 'true')
  try {
    f.load.mockReturnValue({
      maybeSingle: async () => ({
        data: {
          token: 'fixture',
          transactions: {},
          history_checked: null,
          history_ready: false,
        },
      }),
    })
    f.accountsGet.mockResolvedValue({
      data: {
        accounts: [
          {
            account_id: 'card',
            type: 'credit',
            name: 'Card',
            balances: { current: 50, available: 400, iso_currency_code: 'USD' },
          },
        ],
      },
    })
    f.liabilitiesGet.mockRejectedValue(new Error('unsupported'))
    f.transactionsRecurringGet.mockRejectedValue(new Error('unsupported'))
    const ctx = await readContext('alice')
    expect(f.load).toHaveBeenCalledWith('id', 'alice')
    expect(ctx.accounts[0]).toMatchObject({
      kind: 'debt',
      current: 50,
      available: null,
    })
    expect(ctx.issues.join(' ')).toMatch(/Confirm schedules manually/)
    expect(ctx.issues.join(' ')).toMatch(/payment terms manually/)
    expect(JSON.stringify(ctx)).not.toContain('fixture')
    f.load.mockReturnValue({ maybeSingle: async () => ({ data: null }) })
    expect((await readContext('bob')).accounts).toEqual([])
    expect(f.accountsGet).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllEnvs()
  }
})
