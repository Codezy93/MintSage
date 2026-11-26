import { timingSafeEqual, createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { spendingChange } from '@/lib/planning/observations'
import { planningData } from '@/lib/planning/store'
import { scenarioSchema } from '@/lib/planning/types'

const input = z
  .object({
    view: z.enum([
      'runway',
      'recurring',
      'budgets',
      'goals',
      'scenario',
      'spending',
    ]),
    scenario: scenarioSchema.optional(),
  })
  .strict()
const digest = (v: string) => createHash('sha256').update(v).digest()
export async function POST(req: Request) {
  const secret = process.env.AGENT_SERVICE_SECRET
  const owner = z.uuid().safeParse(req.headers.get('X-MintSage-User'))
  if (
    !secret ||
    !owner.success ||
    !timingSafeEqual(
      digest(req.headers.get('Authorization') ?? ''),
      digest('Bearer ' + secret)
    )
  )
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = input.safeParse(await req.json().catch(() => null))
  if (!body.success)
    return Response.json(
      { error: 'Invalid planning tool request' },
      { status: 400 }
    )
  try {
    const {
      report: r,
      ctx,
      plan,
    } = await planningData(
      owner.data,
      body.data.view === 'scenario' ? body.data.scenario : undefined
    )
    const spending = spendingChange(ctx.transactions, ctx.today)
    const budgets = r.budgets.map(
      ({ id, category, detail, actual, projected, limit, risk }) => ({
        id,
        category,
        detail,
        actual,
        projected,
        limit,
        risk,
      })
    )
    const runway = {
      opening: r.opening,
      lowest: r.lowest,
      crossing: r.crossing,
      noIncomeCrossing: r.noIncomeCrossing,
      floor: r.floor,
      allowance: r.allowance,
      payday: r.payday,
      beforePayday: r.beforePayday,
    }
    const views = {
      runway,
      recurring: r.commitments.map(({ id, monthly, last, change }) => ({
        id,
        monthly,
        last,
        change,
      })),
      budgets,
      goals: r.goals.map(({ id, progress, completion, onTime }) => ({
        id,
        progress,
        completion,
        onTime,
      })),
      scenario: { ...runway, budgets },
      spending: spending.map(({ category, previous, recent, change }) => ({
        category,
        previous,
        recent,
        change,
      })),
    }
    const cashSources = [
      ...r.holdings.valuations
        .filter((a) => a.kind === 'cash')
        .map((a) => a.id),
      ...plan.schedules.filter((s) => s.active).map((s) => s.id),
      ...plan.goals.map((g) => g.id),
      ...r.debts.map((d) => d.id),
    ]
    const sources = {
      runway: cashSources,
      scenario: cashSources,
      goals: plan.goals.map((g) => g.id),
      recurring: r.commitments.map((c) => c.id),
      budgets: plan.budgets.map((b) => b.id),
      spending: spending.flatMap((g) => g.sources),
    }
    return Response.json({
      ledger_id: randomUUID(),
      view: body.data.view,
      as_of: r.asOf,
      currency: 'USD',
      sources: [...new Set(sources[body.data.view])],
      assumptions: [
        'Confirmed schedules; available USD cash less reserved goals; recent variable spending repeats.',
        ...(r.warnings.length
          ? [
              'Some inputs are missing or stale. Review the planner for details.',
            ]
          : []),
      ],
      data: views[body.data.view],
    })
  } catch {
    return Response.json(
      { error: 'Planning tool unavailable' },
      { status: 503 }
    )
  }
}
