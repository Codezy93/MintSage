import 'server-only'
import { plaidClient } from '@/lib/plaid/config'
import { privateClient } from '@/lib/supabase/private'
import { dayAdd } from './calendar'
import type { Account, Context, Schedule } from './types'

export async function readContext(owner: string): Promise<Context> {
  const now = new Date(),
    today = now.toISOString().slice(0, 10)
  const ctx: Context = {
    today,
    accounts: [],
    transactions: [],
    historyReady: false,
    issues: [],
    suggestions: [],
    debts: [],
    observedAt: null,
  }
  const row = await privateClient()
    .from('plaid_tokens')
    .select('token,transactions,history_ready,history_checked')
    .eq('id', owner)
    .maybeSingle()
  if (row.error) throw new Error('Could not load the linked connection')
  if (!row.data?.token) {
    ctx.issues.push('Manual accounts only. No bank connection.')
    return ctx
  }
  const request = { access_token: row.data.token }
  ctx.transactions = Object.values(row.data.transactions ?? {})
  ctx.observedAt = row.data.history_checked
  ctx.historyReady = Boolean(
    row.data.history_ready &&
    ctx.observedAt &&
    Date.parse(ctx.observedAt) >= now.getTime() - 48 * 3600000
  )
  try {
    const result = await plaidClient.accountsGet(request, { timeout: 8000 })
    ctx.accounts = result.data.accounts.map((a) => {
      const balances = a.balances
      const kind: Account['kind'] =
        a.type === 'depository'
          ? 'cash'
          : ['credit', 'loan'].includes(a.type)
            ? 'debt'
            : 'asset'
      return {
        id: a.account_id,
        name: a.name,
        kind,
        current: balances.current,
        available: kind === 'cash' ? balances.available : null,
        currency:
          balances.iso_currency_code ??
          balances.unofficial_currency_code ??
          null,
        valued: (
          balances.last_updated_datetime ??
          ctx.observedAt ??
          today
        ).slice(0, 10),
        institutionTime: balances.last_updated_datetime ?? null,
        source: 'plaid',
      }
    })
    if (
      ctx.accounts.some(
        (a) =>
          a.kind === 'cash' &&
          a.currency === 'USD' &&
          !ctx.transactions.some(
            (t) => t.accountId === a.id && t.date <= dayAdd(today, -55)
          )
      )
    )
      ctx.historyReady = false
  } catch {
    ctx.issues.push(
      'Linked balances unavailable. The account inventory may be incomplete.'
    )
    ctx.historyReady = false
  }
  if (process.env.PLAID_RECURRING_ENABLED === 'true') {
    try {
      const { data } = await plaidClient.transactionsRecurringGet(request, {
        timeout: 8000,
      })
      for (const [kind, streams] of [
        ['bill', data.outflow_streams],
        ['income', data.inflow_streams],
      ] as const) {
        for (const s of streams) {
          const frequencies: Record<string, Schedule['frequency']> = {
            WEEKLY: 'weekly',
            BIWEEKLY: 'biweekly',
            MONTHLY: 'monthly',
            ANNUALLY: 'yearly',
          }
          if (
            !s.is_active ||
            !s.predicted_next_date ||
            s.last_amount.amount == null ||
            !frequencies[s.frequency] ||
            !ctx.accounts.some(
              (a) => a.id === s.account_id && a.currency === 'USD'
            )
          )
            continue
          ctx.suggestions.push({
            id: s.stream_id,
            name: s.merchant_name || s.description,
            merchant: s.merchant_name || s.description,
            kind,
            frequency: frequencies[s.frequency],
            date: s.predicted_next_date,
            amount: Math.abs(s.last_amount.amount),
            active: true,
            accountId: s.account_id,
            category: s.personal_finance_category?.primary ?? 'Uncategorized',
            detail: s.personal_finance_category?.detailed ?? '',
          })
        }
      }
    } catch {
      ctx.issues.push(
        'Recurring Transactions unavailable for this connection. Confirm schedules manually.'
      )
    }
  }
  if (process.env.PLAID_LIABILITIES_ENABLED === 'true') {
    try {
      const { data } = await plaidClient.liabilitiesGet(request, {
        timeout: 8000,
      })
      const add = (
        accountId: string | null,
        apr: number | null,
        minimum: number | null,
        due: string | null
      ) => {
        const a = ctx.accounts.find(
          (a) => a.id === accountId && a.currency === 'USD'
        )
        if (a)
          ctx.debts.push({
            id: a.id,
            accountId: a.id,
            name: a.name,
            apr,
            minimum,
            due,
            fee: 0,
            extra: 0,
          })
      }
      for (const d of data.liabilities.credit ?? [])
        add(
          d.account_id,
          d.aprs.find((r) => r.apr_type === 'purchase_apr')?.apr_percentage ??
            null,
          d.minimum_payment_amount,
          d.next_payment_due_date
        )
      for (const d of data.liabilities.student ?? [])
        add(
          d.account_id,
          d.interest_rate_percentage,
          d.minimum_payment_amount,
          d.next_payment_due_date
        )
      for (const d of data.liabilities.mortgage ?? [])
        add(
          d.account_id,
          d.interest_rate.percentage,
          d.next_monthly_payment,
          d.next_payment_due_date
        )
    } catch {
      ctx.issues.push(
        'Liabilities details unavailable. Enter payment terms manually.'
      )
    }
  }
  if (ctx.accounts.some((a) => !a.institutionTime))
    ctx.issues.push(
      'Some balance timestamps are unavailable. Dates use the latest transaction update or retrieval date.'
    )
  return ctx
}
