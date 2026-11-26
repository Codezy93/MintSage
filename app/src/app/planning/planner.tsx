'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { dayAdd } from '@/lib/planning/calendar'
import type { Report } from '@/lib/planning/engine'
import type { spendingChange } from '@/lib/planning/observations'
import {
  planSchema,
  scenarioSchema,
  type Context,
  type Finding,
  type Plan,
} from '@/lib/planning/types'

type Group = 'accounts' | 'schedules' | 'goals' | 'budgets' | 'debts'
type RecordValue = Plan[Group][number]
type View = {
  plan: Plan
  revision: number
  report: Report
  context: Omit<Context, 'transactions'>
  categories: string[]
  changes: ReturnType<typeof spendingChange>
  history: {
    day: string
    net: number | null
    missing: string[]
    valuations: Report['holdings']['valuations']
  }[]
  alerts: Finding[]
}
type Field = {
  key: string
  label: string
  type?: 'number' | 'date' | 'checkbox' | 'category'
  options?: [string, string][]
  nullable?: boolean
}
const currency = (n: number | null) =>
  n === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(n)
const button =
  'rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50'
const box = 'rounded-xl border bg-card p-5 space-y-4'
const opts = (values: string[]): [string, string][] => values.map((v) => [v, v])
const input = 'w-full rounded border bg-background px-2 py-1.5'
const labels: Record<Group, string> = {
  accounts: 'Accounts and valuations',
  schedules: 'Bills, subscriptions and paydays',
  budgets: 'Category budgets',
  goals: 'Savings goals',
  debts: 'Debt payments',
}

function Fields({
  fields,
  values,
}: {
  fields: Field[]
  values: Record<string, unknown>
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const value = values[f.key]
        return (
          <label key={f.key} className="grid gap-1 text-sm">
            {f.label}
            {f.options ? (
              <select
                name={f.key}
                defaultValue={String(value ?? '')}
                className={input}
              >
                {f.options.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <input
                type="checkbox"
                name={f.key}
                defaultChecked={Boolean(value)}
              />
            ) : (
              <input
                name={f.key}
                className={input}
                type={f.type === 'category' ? 'text' : (f.type ?? 'text')}
                list={f.type === 'category' ? 'plaid-categories' : undefined}
                step={f.type === 'number' ? 'any' : undefined}
                defaultValue={String(value ?? '')}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}
function read(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form)
  return Object.fromEntries(
    fields.map((f) => {
      const v = String(data.get(f.key) ?? '').trim()
      return [
        f.key,
        f.type === 'checkbox'
          ? data.has(f.key)
          : f.nullable && !v
            ? null
            : f.type === 'number'
              ? v
                ? Number(v)
                : NaN
              : v,
      ]
    })
  )
}
function nameOf(r: RecordValue) {
  return 'name' in r ? r.name : r.category + (r.detail ? ' / ' + r.detail : '')
}
function scheduleFields(accounts: [string, string][]): Field[] {
  return [
    { key: 'name', label: 'Name' },
    {
      key: 'kind',
      label: 'Type',
      options: opts(['bill', 'subscription', 'income']),
    },
    {
      key: 'accountId',
      label: 'Account charged or credited',
      options: accounts,
    },
    { key: 'amount', label: 'Amount (USD)', type: 'number' },
    { key: 'date', label: 'Next scheduled date', type: 'date' },
    {
      key: 'frequency',
      label: 'Frequency',
      options: opts(['once', 'weekly', 'biweekly', 'monthly', 'yearly']),
    },
    { key: 'category', label: 'Plaid primary category', type: 'category' },
    { key: 'detail', label: 'Detailed category (optional)', type: 'category' },
    { key: 'merchant', label: 'Matching merchant name or identifier' },
    { key: 'active', label: 'Active schedule', type: 'checkbox' },
  ]
}
function editorFields(group: Group, v: View): Field[] {
  const all = new Map(
    [...v.context.accounts, ...v.plan.accounts]
      .filter((a) => a.currency === 'USD')
      .map((a) => [a.id, a])
  )
  const accountOptions = (kind?: string): [string, string][] =>
    [...all.values()]
      .filter((a) => !kind || a.kind === kind)
      .map((a) => [a.id, a.name])
  switch (group) {
    case 'accounts':
      return [
        { key: 'name', label: 'Account name' },
        {
          key: 'kind',
          label: 'Classification',
          options: opts(['cash', 'asset', 'debt']),
        },
        { key: 'currency', label: 'Currency code' },
        {
          key: 'current',
          label: 'Current value (debt positive if owed)',
          type: 'number',
          nullable: true,
        },
        {
          key: 'available',
          label: 'Available cash (cash accounts only)',
          type: 'number',
          nullable: true,
        },
        { key: 'valued', label: 'Valuation date', type: 'date' },
      ]
    case 'schedules':
      return scheduleFields(accountOptions())
    case 'budgets':
      return [
        { key: 'category', label: 'Plaid primary category', type: 'category' },
        {
          key: 'detail',
          label: 'Detailed category (optional)',
          type: 'category',
        },
        { key: 'limit', label: 'Monthly limit (USD)', type: 'number' },
      ]
    case 'goals':
      return [
        { key: 'name', label: 'Goal name' },
        { key: 'target', label: 'Target (USD)', type: 'number' },
        {
          key: 'saved',
          label: 'Already reserved in tracked cash (USD)',
          type: 'number',
        },
        { key: 'contribution', label: 'Monthly reserve (USD)', type: 'number' },
        { key: 'next', label: 'Next contribution', type: 'date' },
        { key: 'deadline', label: 'Target date', type: 'date' },
      ]
    case 'debts':
      return [
        {
          key: 'accountId',
          label: 'Debt account',
          options: accountOptions('debt'),
        },
        { key: 'name', label: 'Lender / payment merchant' },
        {
          key: 'apr',
          label: 'Annual interest (%)',
          type: 'number',
          nullable: true,
        },
        {
          key: 'minimum',
          label: 'Monthly payment (USD)',
          type: 'number',
          nullable: true,
        },
        {
          key: 'due',
          label: 'Next payment date',
          type: 'date',
          nullable: true,
        },
        { key: 'fee', label: 'Monthly fee (USD)', type: 'number' },
        { key: 'extra', label: 'Extra monthly payment (USD)', type: 'number' },
      ]
  }
}
function Editor({
  group,
  view,
  save,
  busy,
}: {
  group: Group
  view: View
  save: (p: Plan) => Promise<boolean>
  busy: boolean
}) {
  const [draft, setDraft] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const fields = editorFields(group, view)
  const defaults = {
    id: '',
    source: 'manual',
    currency: 'USD',
    valued: view.report.asOf,
    fee: 0,
    extra: 0,
    active: true,
    date: dayAdd(view.report.asOf, 1),
    next: dayAdd(view.report.asOf, 1),
    frequency: 'monthly',
    saved: 0,
    contribution: 0,
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const record = {
      ...defaults,
      ...draft,
      ...read(e.currentTarget, fields),
      ...(group === 'accounts'
        ? { source: 'manual', institutionTime: null }
        : {}),
      id: draft?.id ?? crypto.randomUUID(),
    }
    const next = planSchema.safeParse({
      ...view.plan,
      [group]: [...view.plan[group].filter((r) => r.id !== record.id), record],
    })
    if (!next.success) {
      setError(
        next.error.issues
          .map((i) => String(i.path.at(-1)) + ': ' + i.message)
          .join(', ')
      )
      return
    }
    if (await save(next.data)) {
      setDraft(null)
      setError('')
    }
  }
  const linked =
    group === 'accounts'
      ? view.context.accounts
      : group === 'debts'
        ? view.context.debts
        : group === 'schedules'
          ? view.context.suggestions
          : []
  const choices = [
    ...new Map([...linked, ...view.plan[group]].map((r) => [r.id, r])).values(),
  ]
  return (
    <details className={box}>
      <summary className="cursor-pointer font-semibold">
        {labels[group]} ({choices.length})
      </summary>
      {choices.map((r) => (
        <div className="flex flex-wrap items-center gap-3" key={r.id}>
          <span>{nameOf(r)}</span>
          <button
            className={button}
            onClick={() => {
              setDraft(r)
              setError('')
            }}
          >
            {view.plan[group].some((s) => s.id === r.id)
              ? 'Edit'
              : group === 'schedules'
                ? 'Review suggestion'
                : 'Use manual values'}
          </button>
          {view.plan[group].some((s) => s.id === r.id) && (
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                save({
                  ...view.plan,
                  [group]: view.plan[group].filter((s) => s.id !== r.id),
                })
              }
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <form
        key={(draft?.id ?? 'new') + view.revision}
        onSubmit={submit}
        className="space-y-3"
      >
        <Fields
          fields={fields}
          values={{
            ...defaults,
            ...draft,
            ...(group === 'accounts' ? { source: 'manual' } : {}),
          }}
        />
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className={button}>
          {draft ? 'Confirm changes' : 'Add record'}
        </button>
        {draft && (
          <button
            type="button"
            className={button}
            onClick={() => setDraft(null)}
          >
            Cancel edit
          </button>
        )}
      </form>
    </details>
  )
}

function Summary({ r }: { r: Report }) {
  function runway(date: string | null) {
    return r.opening === null
      ? 'Unavailable'
      : (date ?? `Above or at floor through ${r.calendar.at(-1)?.date}`)
  }
  return (
    <section className={box}>
      <h2 className="text-xl font-semibold">Cash outlook · 60 days</h2>
      <p>
        Available after existing goal reserves {currency(r.opening)} · Lowest
        projected {currency(r.lowest)} · Cash floor {currency(r.floor)}
      </p>
      <p>
        First day below floor with expected income: {runway(r.crossing)}.
        Without new income: {runway(r.noIncomeCrossing)}.
      </p>
      <p>
        Estimated additional spending before{' '}
        {r.payday ?? 'the next confirmed payday'}: {currency(r.allowance)}.
      </p>
      <p className="text-sm">
        Scheduled payments and savings reserves are included. Variable activity
        repeats recent weekday patterns. Credit purchases affect budgets; their
        scheduled repayments affect cash.
      </p>
      {r.warnings.map((w, i) => (
        <p key={i} className="text-sm text-amber-800">
          {w}
        </p>
      ))}
    </section>
  )
}
function Calendar({ r }: { r: Report }) {
  return (
    <details className={box}>
      <summary className="cursor-pointer font-semibold">
        Daily cash calendar
      </summary>
      <p>
        Amounts in USD. Ranges resample eight historical weeks. The nominal 80%
        interval covered 60% of day-30 balances in 160 synthetic trials.
        Coverage on real accounts is unknown.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                'Date',
                'Planned items',
                'Income',
                'Outflows',
                'Goal reserve',
                'Balance',
                '80% range',
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.calendar.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.items.join(', ')}</td>
                <td>{currency(d.income)}</td>
                <td>{currency(d.outflow)}</td>
                <td>{currency(d.reserve)}</td>
                <td>{currency(d.balance)}</td>
                <td>
                  {d.low === null
                    ? 'Unavailable'
                    : currency(d.low) + ' – ' + currency(d.high)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
const probability = (n: number | null) =>
  n === null ? 'Unavailable' : Math.round(n * 100) + '%'
async function fetchView(signal?: AbortSignal): Promise<View> {
  const res = await fetch('/api/planning', { cache: 'no-store', signal })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error)
  return body
}
export function Planner() {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [simulation, setSimulation] = useState<{
    baseline: Report
    simulated: Report
  } | null>(null)
  const apply = useCallback((body: View) => {
    setView(body)
    setSimulation(null)
    setError('')
  }, [])
  const load = useCallback(() => fetchView().then(apply), [apply])
  useEffect(() => {
    const controller = new AbortController()
    fetchView(controller.signal)
      .then(apply)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [apply])
  async function act(payload: unknown, simulate = false) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      if (simulate) setSimulation(body)
      else await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update plan')
      return false
    } finally {
      setBusy(false)
    }
  }
  const message = error && (
    <p role="alert">
      {error}{' '}
      <button
        className={button}
        onClick={() => load().catch((e) => setError(e.message))}
      >
        Reload
      </button>
    </p>
  )
  if (!view) return <>{message || <p>Loading your plan…</p>}</>
  const r = view.report,
    p = view.plan
  const save = (plan: Plan) =>
    act({ action: 'save', revision: view.revision, plan })
  const scenarioFields: Field[] = [
    { key: 'purchase', label: 'Hypothetical purchase (USD)', type: 'number' },
    { key: 'date', label: 'Purchase date', type: 'date' },
    { key: 'category', label: 'Purchase category', type: 'category' },
    { key: 'detail', label: 'Detailed category (optional)', type: 'category' },
    { key: 'delay', label: 'Delay expected income (days)', type: 'number' },
    {
      key: 'bill',
      label: 'Bill to change',
      options: [
        ['', 'None'],
        ...p.schedules
          .filter((s) => s.active && s.kind !== 'income')
          .map((s) => [s.id, s.name] as [string, string]),
      ],
    },
    {
      key: 'billChange',
      label: 'Change per bill payment (+/− USD)',
      type: 'number',
    },
    { key: 'reduction', label: 'Reduce variable spending (%)', type: 'number' },
  ]
  return (
    <>
      {message}
      <p className="text-sm">
        USD projections as of {r.asOf} · Last transaction update{' '}
        {view.context.observedAt ?? 'unknown'}
      </p>
      <datalist id="plaid-categories">
        {view.categories.map((c) => (
          <option value={c} key={c} />
        ))}
      </datalist>
      <Summary r={r} />
      <form
        className={box}
        key={view.revision}
        onSubmit={(e) => {
          e.preventDefault()
          const values = new FormData(e.currentTarget)
          void save({
            ...p,
            floor: Number(values.get('floor')),
            alerts: values.has('alerts'),
          })
        }}
      >
        <Fields
          fields={[
            {
              key: 'floor',
              label: 'Cash floor and spending buffer (USD)',
              type: 'number',
            },
            {
              key: 'alerts',
              label: 'Enable unusual spending review',
              type: 'checkbox',
            },
          ]}
          values={{ floor: p.floor, alerts: p.alerts }}
        />
        <button disabled={busy} className={button}>
          Save preferences
        </button>
      </form>
      {(Object.keys(labels) as Group[]).map((g) => (
        <Editor key={g} group={g} view={view} save={save} busy={busy} />
      ))}
      <Calendar r={r} />
      <section className={box}>
        <h2 className="text-xl font-semibold">Commitments and budgets</h2>
        <p>
          Confirmed subscriptions:{' '}
          {currency(r.commitments.reduce((s, c) => s + c.monthly, 0))} per month
          on average.
        </p>
        {Array.from(
          new Set(r.commitments.map((c) => c.merchant.toLowerCase()))
        ).map((merchant) => (
          <div key={merchant}>
            <strong>{merchant}</strong>
            {r.commitments
              .filter((c) => c.merchant.toLowerCase() === merchant)
              .map((c) => (
                <p key={c.id}>
                  {c.name}: {currency(c.monthly)}/month · last charge{' '}
                  {currency(c.last)} · change {currency(c.change)}
                </p>
              ))}
          </div>
        ))}
        {r.budgets.map((b) => (
          <p key={b.id}>
            <strong>
              {b.category} {b.detail}
            </strong>{' '}
            · Observed {currency(b.actual)} of {currency(b.limit)} · Projected{' '}
            {currency(b.projected)} {b.over ? '· Over budget projected' : ''} ·
            Estimated exceedance {probability(b.risk)}
          </p>
        ))}
        <p>
          Experimental floor-crossing estimate: {probability(r.floorRisk)}. Risk
          estimates assume confirmed payments occur as planned.
        </p>
      </section>
      <section className={box}>
        <h2 className="text-xl font-semibold">Goals and debt</h2>
        {r.goals.map((g) => (
          <p key={g.id}>
            {g.name}: {currency(g.saved)} of {currency(g.target)} (
            {Math.round(g.progress * 100)}%). At {currency(g.contribution)}
            /month, estimated completion {g.completion ?? 'unavailable'} ·
            target {g.deadline}.
          </p>
        ))}
        {r.debts.map((d) => (
          <div key={d.id}>
            <strong>{d.name}</strong> · owed {currency(d.balance)} · APR{' '}
            {d.apr ?? 'unknown'}% · minimum {currency(d.minimum)} due{' '}
            {d.due ?? 'unknown'}
            <p>
              Fixed minimum: {d.standard?.months ?? 'undetermined'} months,
              interest {currency(d.standard?.interest ?? null)}. With{' '}
              {currency(d.extra)} extra:{' '}
              {d.accelerated?.months ?? 'undetermined'} months, interest{' '}
              {currency(d.accelerated?.interest ?? null)}. Monthly fee{' '}
              {currency(d.fee)}.
            </p>
          </div>
        ))}
        <p className="text-sm">
          Debt estimates assume a fixed rate, monthly compounding, the stated
          monthly fee and no new borrowing. Savings contributions reserve
          existing cash.
        </p>
      </section>
      <section className={box}>
        <h2 className="text-xl font-semibold">What if?</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const s = scenarioSchema.safeParse(
              read(e.currentTarget, scenarioFields)
            )
            if (s.success)
              void act({ action: 'scenario', scenario: s.data }, true)
            else setError(s.error.issues[0].message)
          }}
        >
          <Fields
            fields={scenarioFields}
            values={{ ...scenarioSchema.parse({}), date: dayAdd(r.asOf, 1) }}
          />
          <button disabled={busy} className={button}>
            Calculate scenario
          </button>
        </form>
        {simulation && (
          <>
            <p>
              Lowest balance: baseline {currency(simulation.baseline.lowest)},
              hypothetical {currency(simulation.simulated.lowest)}. First day
              below floor:{' '}
              {simulation.simulated.opening === null
                ? 'unknown'
                : (simulation.simulated.crossing ?? 'none in horizon')}
              .
            </p>
            <p>
              Before payday: baseline allowance{' '}
              {currency(simulation.baseline.allowance)}, hypothetical{' '}
              {currency(simulation.simulated.allowance)}.
            </p>
            {simulation.simulated.budgets.map((b, i) => (
              <p key={b.id}>
                {b.category} month-end:{' '}
                {currency(simulation.baseline.budgets[i].projected)} →{' '}
                {currency(b.projected)}
              </p>
            ))}
            <Calendar r={simulation.simulated} />
          </>
        )}
      </section>
      <details className={box}>
        <summary>Why did spending change?</summary>
        <p>
          Posted USD spending in the most recent 28 days compared with the
          preceding 28. Refunds offset purchases.{' '}
          {r.historyReady ? '' : 'Coverage is incomplete.'}
        </p>
        {view.changes.map((c) => (
          <details key={c.category}>
            <summary>
              {c.category}: {currency(c.previous)} → {currency(c.recent)}{' '}
              (change {currency(c.change)})
            </summary>
            <p>Transaction IDs: {c.sources.join(', ')}</p>
          </details>
        ))}
      </details>
      <section className={box}>
        <h2 className="text-xl font-semibold">Net-worth history</h2>
        <p>
          Known USD assets less liabilities: {currency(r.holdings.knownNet)}.
          Missing or excluded:{' '}
          {r.holdings.missing.join(', ') || 'none among listed accounts'}.
        </p>
        {r.holdings.valuations.map((a) => (
          <p key={a.id}>
            {a.name} · {a.kind} · {a.current ?? 'unknown'}{' '}
            {a.currency ?? 'unknown currency'} · valued {a.valued} ({a.source})
          </p>
        ))}
        <details>
          <summary>Daily snapshots</summary>
          {view.history.map((h) => (
            <details key={h.day}>
              <summary>
                {h.day} · {currency(h.net)} · excluded{' '}
                {h.missing.join(', ') || 'none'}
              </summary>
              {h.valuations.map((a) => (
                <p key={a.id}>
                  {a.name} · {a.current ?? 'Unavailable'}{' '}
                  {a.currency ?? 'unknown currency'} · {a.valued} · {a.source}
                </p>
              ))}
            </details>
          ))}
        </details>
      </section>
      <section className={box}>
        <h2 className="text-xl font-semibold">Spending review</h2>
        <p>
          Review sends dates, amounts and signal types for up to 20 queued
          candidates to Gemini. Only findings selected by the investigator
          appear here.
        </p>
        <button
          className={button}
          disabled={busy || !p.alerts}
          onClick={() => act({ action: 'investigate' })}
        >
          Investigate queued activity
        </button>
        {p.alerts &&
          view.alerts.map((f) => (
            <div key={f.key}>
              <p>{f.text}</p>
              <small>Supporting transactions: {f.sources.join(', ')}</small>
              {(['confirmed', 'dismissed'] as const).map((status) => (
                <button
                  key={status}
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    act({ action: 'decision', key: f.key, status })
                  }
                >
                  {status === 'confirmed' ? 'Confirm' : 'Dismiss'}
                </button>
              ))}
            </div>
          ))}
      </section>
    </>
  )
}
