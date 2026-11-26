import { expect, it, vi } from 'vitest'
import { GET } from '@/app/auth/confirm/route'
const exchange = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { exchangeCodeForSession: exchange } }) }))

it('exchanges the signup code before entering the protected linking page', async () => {
  exchange.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: {} })
  const req = () => new Request('https://example.invalid/auth/confirm?code=fixture')
  expect((await GET(req())).headers.get('location')).toBe('https://example.invalid/plaid-connect')
  expect(exchange).toHaveBeenCalledWith('fixture')
  expect((await GET(req())).headers.get('location')).toBe('https://example.invalid/login')
})
