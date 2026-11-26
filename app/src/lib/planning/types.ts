import { z } from 'zod'
import type { TransactionRecord } from '@/types/transactions'

const money = z.number().min(-1e10).max(1e10)
const positive = money.nonnegative()
const name = z.string().trim().min(1).max(160)
const id = z.string().min(1).max(200)
export const frequency = z.enum([
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
])
export const accountSchema = z.object({
  id,
  name,
  kind: z.enum(['cash', 'asset', 'debt']),
  currency: z.string().nullable(),
  current: money.nullable(),
  available: money.nullable(),
  valued: z.iso.date(),
  source: z.enum(['manual', 'plaid']),
  institutionTime: z.string().nullable().default(null),
})
export const scheduleSchema = z.object({
  id,
  name,
  accountId: id,
  kind: z.enum(['bill', 'subscription', 'income']),
  amount: positive,
  date: z.iso.date(),
  frequency,
  category: name,
  detail: z.string().max(160).default(''),
  merchant: z.string().max(200).default(''),
  active: z.boolean(),
})
export const budgetSchema = z.object({
  id,
  category: name,
  detail: z.string().max(160),
  limit: positive,
})
export const goalSchema = z.object({
  id,
  name,
  target: positive.positive(),
  saved: positive,
  contribution: positive,
  next: z.iso.date(),
  deadline: z.iso.date(),
})
export const debtSchema = z.object({
  id,
  accountId: id,
  name,
  apr: z.number().min(0).max(100).nullable(),
  minimum: positive.nullable(),
  due: z.iso.date().nullable(),
  fee: positive,
  extra: positive,
})
export type Account = z.infer<typeof accountSchema>
export type Schedule = z.infer<typeof scheduleSchema>
export type Debt = z.infer<typeof debtSchema>
export const planSchema = z
  .object({
    floor: money.default(0),
    alerts: z.boolean().default(true),
    accounts: z.array(accountSchema).max(150).default([]),
    schedules: z.array(scheduleSchema).max(250).default([]),
    goals: z.array(goalSchema).max(100).default([]),
    budgets: z.array(budgetSchema).max(100).default([]),
    debts: z.array(debtSchema).max(150).default([]),
  })
  .superRefine((p, ctx) => {
    for (const rows of [p.accounts, p.schedules, p.goals, p.budgets, p.debts]) {
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate record ID' })
    }
    if (
      p.schedules.some(
        (s) =>
          s.kind !== 'income' &&
          (s.category === 'LOAN_PAYMENTS' || s.category.startsWith('TRANSFER'))
      )
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Enter repayments under Debt payments; internal transfers are excluded.',
      })
    if (new Set(p.debts.map((d) => d.accountId)).size !== p.debts.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Enter one repayment plan per debt account',
      })
  })
export type Plan = z.infer<typeof planSchema>
export const scenarioSchema = z.object({
  purchase: positive.default(0),
  date: z.iso.date().optional(),
  category: name.default('GENERAL_MERCHANDISE'),
  detail: z.string().max(160).default(''),
  delay: z.number().int().min(0).max(60).default(0),
  bill: z.string().max(200).default(''),
  billChange: money.default(0),
  reduction: z.number().min(0).max(100).default(0),
})
export type Scenario = z.infer<typeof scenarioSchema>
export interface Context {
  today: string
  accounts: Account[]
  transactions: TransactionRecord[]
  historyReady: boolean
  issues: string[]
  suggestions: Schedule[]
  debts: Debt[]
  observedAt: string | null
}
export interface Finding {
  key: string
  kind: 'duplicate' | 'unusual' | 'price'
  text: string
  sources: string[]
}
