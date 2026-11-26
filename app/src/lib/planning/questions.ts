import { calculate } from './engine'
import { spendingChange } from './observations'
import { scenarioSchema, type Plan, type Context } from './types'

export function planningIntent(question: string) {
  if (
    /\bwhy\b/i.test(question) &&
    /\b(spend|spending|expenses)\b/i.test(question) &&
    /increas|chang|higher|more/i.test(question)
  )
    return 'spending'
  if (/payday/i.test(question) && /purchas|spend|buy/i.test(question))
    return 'purchase'
  return null
}
export function answerPlanning(question: string, plan: Plan, ctx: Context) {
  if (planningIntent(question) === 'spending') {
    if (!ctx.historyReady)
      return 'The two 28-day periods do not have confirmed current coverage.'
    const groups = spendingChange(ctx.transactions, ctx.today)
    const total = groups.reduce((v, g) => v + g.change, 0)
    return (
      'Observed USD spending changed by $' +
      total.toFixed(2) +
      ' over the latest 28 days versus the preceding 28. ' +
      groups
        .slice(0, 3)
        .map(
          (g) =>
            `${g.category}: $${g.previous.toFixed(2)} to $${g.recent.toFixed(2)} (source transactions ${g.sources.slice(-3).join(', ')}).`
        )
        .join(' ')
    )
  }
  const match = question.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/)
  if (!match)
    return 'Include a USD purchase amount, or open Financial plan to select a category and date.'
  const amount = Number(match[1].replaceAll(',', ''))
  const parsed = scenarioSchema.safeParse({ purchase: amount })
  if (!parsed.success) return 'Choose a valid USD purchase amount.'
  const base = calculate(plan, ctx),
    proposed = calculate(plan, ctx, parsed.data)
  if (
    !ctx.historyReady ||
    base.beforePayday === null ||
    proposed.beforePayday === null
  )
    return 'A current USD spending history, available cash balance, and confirmed payday within 60 days are needed for this estimate.'
  return `Hypothetical cash purchase tomorrow: $${amount.toFixed(2)}. Estimated balance before the ${base.payday} payday changes from $${base.beforePayday.toFixed(2)} to $${proposed.beforePayday.toFixed(2)}. This uses confirmed schedules, goal reserves and eight weeks of weekday spending. Source accounts: ${base.holdings.valuations
    .filter((a) => a.kind === 'cash')
    .map((a) => a.id)
    .join(', ')}.`
}
