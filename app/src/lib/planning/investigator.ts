import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { privateClient } from '@/lib/supabase/private'
import { loadPlan } from './store'
import { calculate } from './engine'
import { anomalyCandidates } from './observations'
import { readContext } from './provider'

// The specialist can select candidates. Only deterministic evidence is displayed.
export async function investigate(owner: string) {
  const { plan } = await loadPlan(owner)
  if (!plan.alerts) return 0
  const db = privateClient()
  const pending = await db
    .from('finance_events')
    .select('event_key,evidence')
    .eq('owner_id', owner)
    .eq('destination', 'anomaly-investigator')
    .eq('status', 'pending')
    .order('created_at')
    .limit(20)
  if (pending.error) throw new Error('Review queue unavailable')
  if (!pending.data.length) return 0
  const ctx = await readContext(owner)
  const report = calculate(plan, ctx)
  const flags = new Map(
    anomalyCandidates(
      ctx.transactions.filter((t) => t.currency === 'USD'),
      new Set(report.matched)
    ).map((f) => [f.key, f])
  )
  const source = new Map(ctx.transactions.map((tx) => [tx.id, tx]))
  const candidates = pending.data.map((row, index) => {
    const f = flags.get(row.event_key)
    if (!f) return { index, signal: null, observations: [] }
    return {
      index,
      signal: f.kind,
      observations: f.sources.flatMap((id) => {
        const t = source.get(id)
        return t ? [{ date: t.date, amount: t.amount }] : []
      }),
    }
  })
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Configure Gemini to investigate queued findings')
  const answer = await new GoogleGenAI({ apiKey: key }).models.generateContent({
    model: 'gemini-2.5-flash',
    config: { responseMimeType: 'application/json' },
    contents:
      'Review these synthetic-indexed USD spending signals. Select items with sufficient evidence for human review. Return JSON {"indices":[integer,...]}. Never decide fraud. ' +
      JSON.stringify(candidates),
  })
  const decision = z
    .object({
      indices: z.array(
        z
          .number()
          .int()
          .min(0)
          .max(candidates.length - 1)
      ),
    })
    .parse(JSON.parse(answer.text ?? ''))
  for (const [index, row] of pending.data.entries()) {
    const show =
      decision.indices.includes(index) &&
      candidates[index].observations.length >= 2
    const saved = await db
      .from('finance_events')
      .update({
        status: show ? 'reviewed' : 'dismissed',
        evidence: flags.get(row.event_key) ?? row.evidence,
      })
      .eq('owner_id', owner)
      .eq('event_key', row.event_key)
      .eq('status', 'pending')
    if (saved.error) throw new Error('Could not save investigation')
  }
  return pending.data.length
}
