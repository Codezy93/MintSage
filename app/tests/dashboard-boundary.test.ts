import { expect, it, vi } from 'vitest'
import getTransactions from '@/lib/transactions/transactions'

const fixture = vi.hoisted(() => ({
  read: vi.fn(), sync: vi.fn(), item: vi.fn(), commit: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/verified-user', () => ({ verifiedUser: async () => ({ id: 'alice' }) }))
vi.mock('@/lib/supabase/private', () => ({ privateClient: () => ({
  from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({error:null}) }) }) }), select: () => ({ eq: fixture.read }) }), rpc: fixture.commit,
}) }))
vi.mock('@/lib/plaid/config', () => ({ plaidClient: { transactionsSync: fixture.sync, itemGet: fixture.item } }))

it('loads only the verified connection and keeps its token out of dashboard data', async () => {
  const token = 'private-fixture-token'
  fixture.read.mockReturnValue({ maybeSingle: async () => ({ data: {
    token, sync_cursor: null, sync_revision: 0, transactions: {},
  } }) })
  fixture.sync.mockResolvedValue({ data: {
    added: [], modified: [], removed: [], next_cursor: 'cursor', has_more: false,
    transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE',
  } })
  fixture.item.mockResolvedValue({ data: { status: { transactions: { last_successful_update: new Date().toISOString() } } } })
  fixture.commit.mockResolvedValue({ data: true })
  const result = await getTransactions()
  expect(fixture.read).toHaveBeenCalledWith('id', 'alice')
  expect(fixture.sync.mock.calls[0][0].access_token).toBe(token)
  expect(Object.keys(result).sort()).toEqual(['ready','transactions','updated'])
  expect(JSON.stringify(result)).not.toContain(token)
})
