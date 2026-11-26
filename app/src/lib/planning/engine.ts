import { countsAsSpending, type TransactionRecord } from '@/types/transactions'
import {
  cents,
  dayAdd,
  distance,
  dollars,
  monthAdd,
  monthDistance,
  occurs,
} from './calendar'
import { inventory, merchantKey, payoff } from './observations'
import {
  scenarioSchema,
  type Account,
  type Context,
  type Plan,
  type Scenario,
  type Schedule,
} from './types'

const HORIZON = 60
const LOOKBACK = 56
type Flow = { cash: number; budgets: number[] }
type Day = {
  date: string
  income: number
  out: number
  reserve: number
  labels: string[]
  budgets: number[]
}

function matches(schedule: Schedule, t: TransactionRecord) {
  const key = (schedule.merchant || schedule.name).trim().toLowerCase()
  return (
    schedule.accountId === t.accountId &&
    (merchantKey(t) === key || t.vendor.trim().toLowerCase() === key) &&
    (schedule.kind === 'income'
      ? t.kind === 'income' && t.amount < 0
      : countsAsSpending(t) && t.amount > 0)
  )
}
export function calculate(
  plan: Plan,
  ctx: Context,
  scenario: Scenario = scenarioSchema.parse({})
) {
  const { today } = ctx
  const start = dayAdd(today, 1 - LOOKBACK)
  const accounts = new Map<string, Account>(
    [...ctx.accounts, ...plan.accounts].map((a) => [a.id, a])
  )
  const holdings = inventory([...accounts.values()])
  if (
    ctx.issues.some((issue) => issue.startsWith('Linked balances unavailable'))
  )
    holdings.opening = null
  const warnings = [...ctx.issues]
  const rows = ctx.transactions.filter(
    (t) => !t.pending && t.currency === 'USD' && t.date <= today
  )
  const debts = new Map(
    [...ctx.debts, ...plan.debts].map((d) => [d.accountId, d])
  )
  const budgetFits = (category: string, detail: string | null) =>
    plan.budgets.map(
      (b) => b.category === category && (!b.detail || b.detail === detail)
    )
  const blank = () => plan.budgets.map(() => 0)
  const days: Day[] = Array.from({ length: HORIZON }, (_, i) => ({
    date: dayAdd(today, i + 1),
    income: 0,
    out: 0,
    reserve: 0,
    labels: [],
    budgets: blank(),
  }))
  const dayFor = (date: string) => days[distance(today, date) - 1]
  const claimed = new Set<string>()
  const commitments: {
    id: string
    name: string
    merchant: string
    monthly: number
    last: number | null
    change: number | null
  }[] = []
  for (const schedule of plan.schedules) {
    const account = accounts.get(schedule.accountId)
    if (!account || account.currency !== 'USD') {
      warnings.push(`Check account for ${schedule.name}.`)
      continue
    }
    const candidates = rows.filter((t) => matches(schedule, t))
    const observed: TransactionRecord[] = []
    for (let offset = -LOOKBACK - 3; offset <= HORIZON; offset++) {
      const date = dayAdd(today, offset)
      if (!occurs(schedule.date, schedule.frequency, date)) continue
      if (offset > 0 && date < schedule.date) continue
      const match = candidates
        .filter(
          (t) => !claimed.has(t.id) && Math.abs(distance(t.date, date)) <= 3
        )
        .sort(
          (a, b) =>
            Math.abs(distance(a.date, date)) -
              Math.abs(distance(b.date, date)) ||
            Math.abs(Math.abs(a.amount) - schedule.amount) -
              Math.abs(Math.abs(b.amount) - schedule.amount)
        )[0]
      if (match) {
        claimed.add(match.id)
        observed.push(match)
        continue
      }
      if (offset <= 0 || !schedule.active) continue
      const amount = cents(
        Math.max(
          0,
          schedule.amount +
            (scenario.bill === schedule.id ? scenario.billChange : 0)
        )
      )
      const target = dayFor(
        schedule.kind === 'income' ? dayAdd(date, scenario.delay) : date
      )
      if (!target) continue
      target.labels.push(schedule.name)
      if (schedule.kind === 'income') {
        if (account.kind === 'cash') target.income += amount
      } else {
        if (account.kind === 'cash') target.out += amount
        budgetFits(schedule.category, schedule.detail).forEach((hit, i) => {
          if (hit) target.budgets[i] += amount
        })
      }
    }
    if (schedule.active && schedule.kind === 'subscription') {
      const rates = {
        once: 0,
        weekly: 52 / 12,
        biweekly: 26 / 12,
        monthly: 1,
        yearly: 1 / 12,
      }
      commitments.push({
        id: schedule.id,
        name: schedule.name,
        merchant: schedule.merchant || schedule.name,
        monthly: dollars(cents(schedule.amount * rates[schedule.frequency])),
        last: observed.at(-1)?.amount ?? null,
        change:
          observed.length >= 2
            ? dollars(
                cents(observed.at(-1)!.amount) - cents(observed.at(-2)!.amount)
              )
            : null,
      })
    }
  }
  const debtResults = []
  for (const debt of debts.values()) {
    const account = accounts.get(debt.accountId)
    if (account?.currency !== 'USD' || account.kind !== 'debt') continue
    const balance = account.current
    debtResults.push({
      ...debt,
      balance,
      standard: payoff(balance, debt, 0),
      accelerated: payoff(balance, debt, debt.extra),
    })
    if (debt.due === null || debt.minimum === null || balance === null) {
      warnings.push(`Missing payment terms for ${debt.name}.`)
      continue
    }
    let remaining = Math.max(0, cents(balance))
    for (const day of days) {
      if (
        !remaining ||
        day.date < debt.due ||
        !occurs(debt.due, 'monthly', day.date)
      )
        continue
      const alreadyPaid = rows.find(
        (t) =>
          !claimed.has(t.id) &&
          t.kind === 'debt' &&
          t.amount > 0 &&
          accounts.get(t.accountId)?.kind === 'cash' &&
          t.vendor.toLowerCase() === debt.name.toLowerCase() &&
          Math.abs(distance(day.date, t.date)) <= 3
      )
      if (alreadyPaid) {
        claimed.add(alreadyPaid.id)
        continue
      }
      remaining +=
        Math.round((remaining * (debt.apr ?? 0)) / 1200) + cents(debt.fee)
      const amount = Math.min(remaining, cents(debt.minimum + debt.extra))
      day.out += amount
      remaining -= amount
      day.labels.push(debt.name + ' repayment')
    }
  }
  for (const a of accounts.values())
    if (a.kind === 'debt' && a.currency === 'USD' && !debts.has(a.id))
      warnings.push(`No settlement schedule for ${a.name}.`)
  const goals = plan.goals.map((g) => {
    const left = Math.max(0, cents(g.target) - cents(g.saved))
    let firstOffset = Math.max(0, monthDistance(g.next, today))
    if (monthAdd(g.next, firstOffset) <= today) firstOffset++
    const contribution = cents(g.contribution)
    const n = contribution > 0 ? Math.ceil(left / contribution) : null
    const completion =
      left === 0
        ? today
        : n !== null && n < 1200
          ? monthAdd(g.next, firstOffset + n - 1)
          : null
    let needed = left
    for (const d of days)
      if (needed && d.date >= g.next && occurs(g.next, 'monthly', d.date)) {
        const transfer = Math.min(needed, cents(g.contribution))
        needed -= transfer
        d.reserve += transfer
        d.labels.push(g.name + ' contribution')
      }
    return {
      ...g,
      progress: Math.min(1, g.saved / g.target),
      completion,
      onTime: completion ? completion <= g.deadline : null,
    }
  })
  const purchaseDay = dayFor(scenario.date ?? dayAdd(today, 1))
  if (scenario.purchase && !purchaseDay)
    throw new Error('Choose a purchase date inside the 60-day projection.')
  if (
    scenario.bill &&
    !plan.schedules.some(
      (s) => s.id === scenario.bill && s.kind !== 'income' && s.active
    )
  )
    throw new Error('Choose an active bill for the amount change.')
  if (purchaseDay && scenario.purchase) {
    purchaseDay.out += cents(scenario.purchase)
    purchaseDay.labels.push('Hypothetical purchase')
    budgetFits(scenario.category, scenario.detail).forEach((hit, i) => {
      if (hit) purchaseDay.budgets[i] += cents(scenario.purchase)
    })
  }
  const history: Flow[] = Array.from({ length: LOOKBACK }, () => ({
    cash: 0,
    budgets: blank(),
  }))
  const actual = blank()
  for (const t of rows) {
    if (!countsAsSpending(t)) continue
    const amount = cents(t.amount),
      hits = budgetFits(t.category, t.detailedCategory)
    if (t.date.slice(0, 7) === today.slice(0, 7))
      hits.forEach((hit, i) => {
        if (hit) actual[i] += amount
      })
    const h = history[distance(start, t.date)]
    if (!h || claimed.has(t.id)) continue
    if (accounts.get(t.accountId)?.kind === 'cash') h.cash += amount
    hits.forEach((hit, i) => {
      if (hit) h.budgets[i] += amount
    })
  }
  if (!ctx.historyReady)
    warnings.push(
      'Variable spending history is incomplete. Calendar values include confirmed items only.'
    )
  if (holdings.opening === null)
    warnings.push(
      'Enter available USD cash for each cash account to calculate runway.'
    )
  if ([...accounts.values()].some((a) => a.valued < dayAdd(today, -2)))
    warnings.push('Some account valuations are more than two days old.')
  const cash =
    holdings.opening === null
      ? null
      : holdings.opening - plan.goals.reduce((v, g) => v + cents(g.saved), 0)
  const reduce = (v: number) =>
    Math.round(v > 0 ? v * (1 - scenario.reduction / 100) : v)
  const meanFlow = (index: number): Flow => {
    const same = history.filter((_, i) => i % 7 === index % 7)
    return {
      cash: same.reduce((s, h) => s + h.cash, 0) / 8,
      budgets: plan.budgets.map(
        (_, j) => same.reduce((s, h) => s + h.budgets[j], 0) / 8
      ),
    }
  }
  const expected = days.map((_, i) =>
    ctx.historyReady ? meanFlow(i) : { cash: 0, budgets: blank() }
  )
  function path(variable: Flow[]) {
    let balance = cash ?? 0,
      without = balance
    const totals = [...actual]
    const calendar = days.map((d, i) => {
      const out = d.out + reduce(variable[i].cash)
      balance += d.income - out - d.reserve
      without -= out + d.reserve
      if (d.date.slice(0, 7) === today.slice(0, 7))
        totals.forEach((_, j) => {
          totals[j] += d.budgets[j] + reduce(variable[i].budgets[j])
        })
      return {
        date: d.date,
        items: d.labels,
        income: dollars(d.income),
        outflow: dollars(out),
        reserve: dollars(d.reserve),
        balance: cash === null ? null : dollars(balance),
        withoutIncome: cash === null ? null : dollars(without),
      }
    })
    return { calendar, totals }
  }
  const base = path(expected)
  const opening = cash === null ? null : dollars(cash)
  const crossing = (key: 'balance' | 'withoutIncome') =>
    opening === null
      ? null
      : opening < plan.floor
        ? today
        : (base.calendar.find((d) => d[key] !== null && d[key]! < plan.floor)
            ?.date ?? null)
  const payday = days.find((d) => d.income > 0)?.date
  const beforePay = base.calendar
    .filter((d) => payday && d.date < payday)
    .map((d) => d.balance ?? 0)
  const beforePayday =
    payday && opening !== null ? (beforePay.at(-1) ?? opening) : null
  const allowance =
    opening !== null && payday && ctx.historyReady
      ? Math.max(0, Math.min(opening, ...beforePay) - plan.floor)
      : null
  let seed = 9187
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const balances = days.map(() => [] as number[])
  const exceeds = blank()
  let floorHits = 0
  const trials = ctx.historyReady ? 200 : 0
  for (let k = 0; k < trials; k++) {
    let week = 0
    const simulated = path(
      days.map((_, i) => {
        if (i % 7 === 0) week = Math.floor(random() * 8)
        return history[7 * week + (i % 7)]
      })
    )
    simulated.calendar.forEach((d, i) => {
      if (d.balance !== null) balances[i].push(d.balance)
    })
    if (
      opening !== null &&
      (opening < plan.floor ||
        simulated.calendar.some((d) => d.balance! < plan.floor))
    )
      floorHits++
    simulated.totals.forEach((v, i) => {
      if (v > cents(plan.budgets[i].limit)) exceeds[i]++
    })
  }
  const calendar = base.calendar.map((d, i) => {
    const v = balances[i].sort((a, b) => a - b)
    return {
      ...d,
      low: v.length ? v[Math.floor(v.length * 0.1)] : null,
      high: v.length ? v[Math.ceil(v.length * 0.9) - 1] : null,
    }
  })
  return {
    opening,
    floor: plan.floor,
    horizon: HORIZON,
    crossing: crossing('balance'),
    noIncomeCrossing: crossing('withoutIncome'),
    lowest:
      opening === null
        ? null
        : Math.min(opening, ...calendar.map((d) => d.balance!)),
    payday: payday ?? null,
    beforePayday,
    allowance: allowance === null ? null : dollars(cents(allowance)),
    floorRisk: trials && opening !== null ? floorHits / trials : null,
    calendar,
    budgets: plan.budgets.map((b, i) => ({
      ...b,
      actual: dollars(actual[i]),
      projected: dollars(base.totals[i]),
      over: base.totals[i] > cents(b.limit),
      risk: trials ? exceeds[i] / trials : null,
    })),
    goals,
    debts: debtResults,
    holdings,
    commitments,
    warnings,
    matched: [...claimed],
    asOf: today,
    historyReady: ctx.historyReady,
  }
}
export type Report = ReturnType<typeof calculate>
