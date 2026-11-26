import { expect, it, vi } from 'vitest'

const generate = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: generate } } }))
vi.mock('@/lib/supabase/verified-user', () => ({ verifiedUser: async () => ({ id: 'alice' }) }))

it('calls Gemini with summaries and returns its answer with calculated figures', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'fixture')
  try {
    const { POST } = await import('@/app/api/analyze/route')
    generate.mockResolvedValue({ text: 'Fixture analysis' })
    const row = { id: 'private-id', accountId: 'private-account', vendor: 'private-vendor', merchantId: null,
      amount: 17, date: '2026-01-01', kind: 'purchase', currency: 'USD', category: 'food',
      detailedCategory: null, pending: false, pendingId: null, needsReview: false }
    const res = await POST(new Request('http://localhost', { method: 'POST',
      body: JSON.stringify({ transactions: [row], question: 'Summarize spending', forecast: [] }) }))
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.answer).toBe('Fixture analysis')
    expect(result.eda.totals.totalExpense).toBe(17)
    expect(generate.mock.calls[0][0].contents).not.toMatch(/private-/)
  } finally {
    vi.unstubAllEnvs()
  }
})
