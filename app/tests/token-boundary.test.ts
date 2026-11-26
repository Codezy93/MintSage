import { expect, it, vi } from 'vitest'
import { POST } from '@/app/api/plaid/exchange-public-token/route'

const fixture = vi.hoisted(() => ({
  getUser: vi.fn(), exchange: vi.fn(), save: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: fixture.getUser } }) }))
vi.mock('@/lib/plaid/config', () => ({ plaidClient: { itemPublicTokenExchange: fixture.exchange } }))
vi.mock('@/lib/plaid/tokens', () => ({ savePlaidToken: fixture.save }))

it('uses the verified owner and returns only connection status to the browser', async () => {
  fixture.getUser.mockResolvedValue({ data: { user: { id: 'alice' } } })
  fixture.exchange.mockResolvedValue({ data: { access_token: 'fixture-private' } })
  const response = await POST(new Request('https://example.invalid', {
    method: 'POST', body: JSON.stringify({ public_token: 'fixture-public', user_id: 'bob' }),
  }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ connected: true })
  expect(fixture.save).toHaveBeenCalledWith({ id: 'alice' }, 'fixture-private')
})
