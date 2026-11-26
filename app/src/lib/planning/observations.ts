import { countsAsSpending, type TransactionRecord } from '@/types/transactions'
import { cents, distance, dollars } from './calendar'
import type { Account, Debt, Finding } from './types'

export function inventory(accounts: Account[]) {
  const usd = accounts.filter((a) => a.currency === 'USD')
  const cash = usd.filter((a) => a.kind === 'cash')
  const missing = accounts
    .filter((a) => a.current === null || a.currency !== 'USD')
    .map((a) => a.name)
  const known = usd.filter((a) => a.current !== null)
  return {
    opening:
      cash.length && cash.every((a) => a.available !== null)
        ? cash.reduce((v, a) => v + cents(a.available!), 0)
        : null,
    knownNet: known.length
      ? dollars(
          known.reduce(
            (v, a) => v + (a.kind === 'debt' ? -1 : 1) * cents(a.current!),
            0
          )
        )
      : null,
    missing,
    valuations: accounts.map(
      ({ id, name, valued, current, currency, kind, source }) => ({
        id,
        name,
        valued,
        current,
        currency,
        kind,
        source,
      })
    ),
  }
}
export function payoff(balance: number | null, debt: Debt, extra: number) {
  if (balance === null || debt.apr === null || debt.minimum === null)
    return null
  let owed = Math.max(0, cents(balance)),
    interest = 0,
    fees = 0,
    months = 0
  const payment = cents(debt.minimum + extra)
  while (owed > 0 && months < 600) {
    const charge = Math.round((owed * debt.apr) / 1200),
      fee = cents(debt.fee)
    if (payment <= charge + fee) return null
    owed = Math.max(0, owed + charge + fee - payment)
    interest += charge
    fees += fee
    months++
  }
  return owed
    ? null
    : { months, interest: dollars(interest), fees: dollars(fees) }
}
export function merchantKey(t: TransactionRecord) {
  return (t.merchantId || t.vendor).trim().toLowerCase()
}
export function anomalyCandidates(
  rows: TransactionRecord[],
  recurring: Set<string>,
  since?: string
) {
  const findings: Finding[] = []
  const groups = new Map<string, TransactionRecord[]>()
  for (const t of rows.filter((t) => countsAsSpending(t) && t.amount > 0)) {
    const key = JSON.stringify([t.accountId, merchantKey(t)])
    const group = groups.get(key) ?? []
    group.push(t)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    )
    for (const [index, latest] of group.entries()) {
      if (since && latest.date < since) continue
      const prior = group.slice(Math.max(0, index - 6), index)
      const prev = prior.at(-1)
      if (!prev) continue
      const emit = (kind: Finding['kind'], text: string, sources: string[]) => {
        findings.push({ key: kind + '-' + latest.id, kind, text, sources })
      }
      if (
        latest.amount === prev.amount &&
        distance(prev.date, latest.date) <= 1
      )
        emit(
          'duplicate',
          `Two posted charges of $${latest.amount.toFixed(2)} at ${latest.vendor} on ${prev.date} and ${latest.date}.`,
          [prev.id, latest.id]
        )
      if (prior.length >= 3) {
        const amounts = prior.map((t) => t.amount).sort((a, b) => a - b)
        const median =
          (amounts[Math.floor((amounts.length - 1) / 2)] +
            amounts[Math.floor(amounts.length / 2)]) /
          2
        if (latest.amount >= median * 3 && latest.amount - median >= 25)
          emit(
            'unusual',
            `$${latest.amount.toFixed(2)} at ${latest.vendor} versus a prior median of $${median.toFixed(2)}.`,
            [...prior.map((t) => t.id), latest.id]
          )
      }
      const previousBill = prior.filter((t) => recurring.has(t.id)).at(-1)
      if (
        recurring.has(latest.id) &&
        previousBill &&
        latest.amount !== previousBill.amount
      )
        emit(
          'price',
          `Recurring charge at ${latest.vendor} changed from $${previousBill.amount.toFixed(2)} to $${latest.amount.toFixed(2)}.`,
          [previousBill.id, latest.id]
        )
    }
  }
  return findings
}

export function spendingChange(rows: TransactionRecord[], today: string) {
  const totals = new Map<
    string,
    { previous: number; recent: number; sources: string[] }
  >()
  for (const t of rows) {
    const age = distance(t.date, today)
    if (age < 0 || age >= 56 || t.currency !== 'USD' || !countsAsSpending(t))
      continue
    const group = totals.get(t.category) ?? {
      previous: 0,
      recent: 0,
      sources: [],
    }
    group[age < 28 ? 'recent' : 'previous'] += cents(t.amount)
    group.sources.push(t.id)
    totals.set(t.category, group)
  }
  return [...totals]
    .map(([category, v]) => ({
      category,
      previous: dollars(v.previous),
      recent: dollars(v.recent),
      change: dollars(v.recent - v.previous),
      sources: v.sources,
    }))
    .sort((a, b) => b.change - a.change)
}
