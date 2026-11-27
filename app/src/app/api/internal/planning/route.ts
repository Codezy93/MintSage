import { timingSafeEqual, createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { buildLast60Days } from '@/lib/transactions/aggregation'
import { countsAsSpending } from '@/types/transactions'
import {
  anomalyCandidates,
  merchantKey,
  spendingChange,
} from '@/lib/planning/observations'
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
      'flags',
      'history',
      'forecast_history',
    ]),
    scenario: scenarioSchema.optional(),
    event: z.string().max(300).optional(),
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
    const rows = ctx.transactions.filter(
      (t) => !t.pending && t.currency === 'USD' && t.date <= ctx.today
    )
    const evidence = (
      data: unknown,
      sources: string[],
      assumptions: string[]
    ) =>
      Response.json({
        ledger_id: randomUUID(),
        view: body.data.view,
        as_of: r.asOf,
        currency: 'USD',
        sources,
        assumptions,
        data,
      })
    if (body.data.view === 'forecast_history') {
      if (!r.historyReady)
        return Response.json({ error: 'History incomplete' }, { status: 422 })
      const series = buildLast60Days(rows, new Date(ctx.today + 'T00:00:00Z'))
      return evidence(
        { ...series, currency: 'USD' },
        rows
          .filter((t) => countsAsSpending(t) && t.date >= series.user_dates[0])
          .map((t) => t.id),
        ['Posted USD purchases and refunds over the observed window.']
      )
    }
    if (body.data.view === 'history') {
      const selected = rows
        .filter((t) => t.needsReview)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 50)
      return evidence(
        selected.map((t) => ({ id: t.id, date: t.date, amount: t.amount })),
        selected.map((t) => t.id),
        [
          'Up to fifty recent ambiguous posted USD records. Classification requires user confirmation.',
        ]
      )
    }
    if (body.data.view === 'flags') {
      const byId = new Map(rows.map((t) => [t.id, t]))
      const flags = plan.alerts
        ? anomalyCandidates(rows, new Set(r.matched))
            .filter((f) => !body.data.event || f.key === body.data.event)
            .slice(-50)
        : []
      return evidence(
        flags.map((f) => {
          const tx = byId.get(f.sources[f.sources.length - 1])!
          return {
            id: f.key,
            kind: f.kind,
            amount: tx.amount,
            date: tx.date,
            group: digest(
              JSON.stringify([
                owner.data,
                tx.accountId,
                merchantKey(tx),
                f.kind,
              ])
            ).toString('hex'),
          }
        }),
        [...new Set(flags.flatMap((f) => f.sources))],
        ['Rule-based signals require review.']
      )
    }
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
