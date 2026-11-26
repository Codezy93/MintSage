import 'server-only'
import { privateClient } from '@/lib/supabase/private'
import { dayAdd } from './calendar'
import { calculate } from './engine'
import { anomalyCandidates } from './observations'
import { readContext } from './provider'
import { planSchema, type Finding, type Plan, type Scenario } from './types'

export async function loadPlan(owner: string) {
  const row = await privateClient()
    .from('finance_plans')
    .select('settings,revision')
    .eq('owner_id', owner)
    .maybeSingle()
  if (row.error) throw new Error('Finance plan unavailable')
  return {
    plan: planSchema.parse(row.data?.settings ?? {}),
    revision: Number(row.data?.revision ?? 0),
  }
}
export async function savePlan(owner: string, revision: number, plan: Plan) {
  const db = privateClient().from('finance_plans')
  if (!revision) {
    const { error } = await db.insert({
      owner_id: owner,
      revision: 1,
      settings: plan,
    })
    if (error && error.code !== '23505')
      throw new Error('Could not save settings')
    return !error
  }
  const { data, error } = await db
    .update({ revision: revision + 1, settings: plan })
    .eq('owner_id', owner)
    .eq('revision', revision)
    .select('revision')
  if (error) throw new Error('Could not save settings')
  return data.length === 1
}
export async function planningData(owner: string, scenario?: Scenario) {
  const [{ plan, revision }, ctx] = await Promise.all([
    loadPlan(owner),
    readContext(owner),
  ])
  const report = calculate(plan, ctx, scenario)
  return { plan, revision, ctx, report }
}
export async function recordBaseline(
  owner: string,
  data: Awaited<ReturnType<typeof planningData>>
) {
  const { plan, ctx, report } = data,
    db = privateClient()
  if (
    report.holdings.valuations.length &&
    !ctx.issues.some((v) => v.startsWith('Linked balances unavailable'))
  ) {
    const saved = await db
      .from('finance_snapshots')
      .upsert(
        {
          owner_id: owner,
          day: ctx.today,
          inventory: report.holdings,
          recorded_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,day' }
      )
    if (saved.error) throw new Error('Could not record daily inventory')
  }
  const events = []
  if (
    report.crossing &&
    !report.warnings.some(
      (v) => v.startsWith('Missing payment') || v.startsWith('No settlement')
    )
  )
    events.push({
      owner_id: owner,
      event_key: `floor:${plan.floor}:${report.crossing}`,
      destination: 'cash-flow-analyst',
      evidence: {
        date: report.crossing,
        floor: plan.floor,
        asOf: ctx.today,
        includesVariableSpending: ctx.historyReady,
      },
    })
  if (plan.alerts)
    for (const flag of anomalyCandidates(
      ctx.transactions.filter((t) => t.currency === 'USD'),
      new Set(report.matched),
      dayAdd(ctx.today, -59)
    ))
      events.push({
        owner_id: owner,
        event_key: flag.key,
        destination: 'anomaly-investigator',
        evidence: flag,
      })
  if (events.length) {
    const saved = await db
      .from('finance_events')
      .upsert(events, {
        onConflict: 'owner_id,event_key',
        ignoreDuplicates: true,
      })
    if (saved.error) throw new Error('Could not queue planning events')
  }
}
export async function records(owner: string) {
  const db = privateClient()
  const [history, alerts] = await Promise.all([
    db
      .from('finance_snapshots')
      .select('day,inventory')
      .eq('owner_id', owner)
      .order('day', { ascending: false })
      .limit(365),
    db
      .from('finance_events')
      .select('event_key,evidence,status')
      .eq('owner_id', owner)
      .eq('destination', 'anomaly-investigator')
      .eq('status', 'reviewed')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  if (history.error || alerts.error)
    throw new Error('Could not load planning records')
  return {
    history: history.data.map((r) => ({
      day: String(r.day),
      net: r.inventory.knownNet as number | null,
      missing: r.inventory.missing as string[],
      valuations: r.inventory.valuations as ReturnType<
        typeof calculate
      >['holdings']['valuations'],
    })),
    alerts: alerts.data.map((r) => r.evidence as Finding),
  }
}
