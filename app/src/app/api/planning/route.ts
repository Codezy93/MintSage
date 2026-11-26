import { z } from 'zod'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { privateClient } from '@/lib/supabase/private'
import { planSchema, scenarioSchema } from '@/lib/planning/types'
import {
  planningData,
  recordBaseline,
  records,
  savePlan,
} from '@/lib/planning/store'
import { calculate } from '@/lib/planning/engine'
import { spendingChange } from '@/lib/planning/observations'
import { investigate } from '@/lib/planning/investigator'

const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    revision: z.number().int().nonnegative(),
    plan: planSchema,
  }),
  z.object({ action: z.literal('scenario'), scenario: scenarioSchema }),
  z.object({ action: z.literal('investigate') }),
  z.object({
    action: z.literal('decision'),
    key: z.string().max(300),
    status: z.enum(['confirmed', 'dismissed']),
  }),
])
export async function POST(req: Request) {
  const user = await verifiedUser()
  if (!user)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  const parsed = input.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    )
  const action = parsed.data
  try {
    if (action.action === 'scenario') {
      const baseline = await planningData(user.id)
      const simulated = calculate(baseline.plan, baseline.ctx, action.scenario)
      return Response.json({ baseline: baseline.report, simulated })
    }
    if (
      action.action === 'save' &&
      !(await savePlan(user.id, action.revision, action.plan))
    )
      return Response.json(
        { error: 'Your plan changed in another tab. Reload before saving.' },
        { status: 409 }
      )
    if (action.action === 'decision') {
      const { error } = await privateClient()
        .from('finance_events')
        .update({ status: action.status })
        .eq('owner_id', user.id)
        .eq('event_key', action.key)
        .eq('destination', 'anomaly-investigator')
        .eq('status', 'reviewed')
      if (error) throw new Error()
    }
    if (action.action === 'investigate') await investigate(user.id)
    return Response.json({ saved: true })
  } catch {
    return Response.json(
      {
        error:
          'Planning operation unavailable. Check the inputs and service configuration.',
      },
      { status: 503 }
    )
  }
}
export async function GET() {
  const user = await verifiedUser()
  if (!user)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const data = await planningData(user.id)
    await recordBaseline(user.id, data)
    const { transactions, ...context } = data.ctx
    const categories = Array.from(
      new Set(
        transactions
          .filter((t) => t.currency === 'USD')
          .flatMap((t) => [t.category, t.detailedCategory ?? ''])
          .filter(Boolean)
      )
    ).sort()
    return Response.json({
      plan: data.plan,
      revision: data.revision,
      context,
      report: data.report,
      categories,
      changes: spendingChange(transactions, context.today),
      ...(await records(user.id)),
    })
  } catch {
    return Response.json(
      {
        error:
          'Could not load planning data. Check the planning migration and try again.',
      },
      { status: 503 }
    )
  }
}
