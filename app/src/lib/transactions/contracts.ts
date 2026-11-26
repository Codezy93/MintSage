import { z } from 'zod'

export const transactionSchema = z.object({
  id: z.string(), accountId: z.string(), date: z.iso.date(), amount: z.number(),
  currency: z.string().nullable(), pending: z.boolean(), pendingId: z.string().nullable(),
  vendor: z.string(), merchantId: z.string().nullable(), category: z.string(),
  detailedCategory: z.string().nullable(), needsReview: z.boolean(),
  kind: z.enum(['purchase', 'refund', 'income', 'transfer', 'debt', 'review']),
})

export const analysisRequest = z.object({
  transactions: z.array(transactionSchema).nonempty(),
  forecast: z.union([z.array(z.number()).length(30), z.tuple([])]).default([]),
  question: z.string().trim().min(1),
})

export function nextDay(previous: string, current: string) {
  return Date.parse(current) - Date.parse(previous) === 86400000
}

function consecutive(days: string[]) {
  return days.every((day, i) => i === 0 || nextDay(days[i - 1], day))
}

export const forecastRequest = z.object({
  currency: z.literal('USD').default('USD'),
  user_dates: z.array(z.iso.date()).length(60).refine(consecutive),
  user_expenses: z.array(z.number()).length(60),
})

export const projection = z.object({
  currency: z.literal('USD'),
  model: z.literal('weekly-seasonal-naive'),
  forecast: z.array(z.number()).length(30),
  horizon_dates: z.array(z.iso.date()).length(30).refine(consecutive),
})
