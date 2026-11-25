import { countsAsSpending, type TransactionRecord } from '@/types/transactions'

export function runEDA(transactions: TransactionRecord[], forecast: number[]) {
  const txSorted = transactions.filter(t => t.currency === 'USD' && !t.pending && (countsAsSpending(t) || t.kind === 'income')).sort(
    (a, b) =>
      new Date(a.date).getTime() -
      new Date(b.date).getTime(),
  )

  // 👉 Income = negative values (reported positive)
  const totalIncome = txSorted
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + -t.amount, 0)

  // 👉 Expense = positive values
  const totalExpense = txSorted
    .filter(countsAsSpending)
    .reduce((sum, t) => sum + t.amount, 0)

  // 👉 Net = income - expense
  const totalNet = totalIncome - totalExpense

  // ----- Daily net series (income positive, expense negative) -----
  const dateMap = new Map<string, number>()
  for (const t of txSorted) {
    const key = t.date

    // canonical: income (+), expense (−)
    const delta = -t.amount
    dateMap.set(key, (dateMap.get(key) ?? 0) + delta)
  }

  const daily = [...dateMap.entries()]
    .sort(
      (a, b) =>
        new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    )
    .map(([date, value]) => ({ date, value }))

  const dailyVals = daily.map((d) => d.value)

  // ----- Volatility + trend on net daily values -----
  let volatility = 0
  let slope = 0
  let trend: 'increasing' | 'decreasing' | 'flat' = 'flat'

  if (dailyVals.length > 1) {
    const mean =
      dailyVals.reduce((a, b) => a + b, 0) / dailyVals.length
    const variance =
      dailyVals.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
      dailyVals.length
    volatility = Math.sqrt(variance)

    const xs = dailyVals.map((_, i) => i)
    const ys = dailyVals
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length
    let num = 0
    let den = 0
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean)
      den += (xs[i] - xMean) ** 2
    }
    slope = den === 0 ? 0 : num / den
    if (slope > 0) trend = 'increasing'
    else if (slope < 0) trend = 'decreasing'
  }

  // ----- Category stats (net, using same delta sign) -----
  const catMap = new Map<
    string,
    { sum: number; count: number; max: number }
  >()
  for (const t of txSorted) {
    const prev =
      catMap.get(t.category) ?? {
        sum: 0,
        count: 0,
        max: -Infinity,
      }
    const delta = -t.amount // income +, expense −
    prev.sum += delta
    prev.count += 1
    prev.max = Math.max(prev.max, delta)
    catMap.set(t.category, prev)
  }

  const categoryStats = [...catMap.entries()].map(
    ([category, v]) => ({
      category,
      sum: v.sum,    // positive → net inflow, negative → net outflow
      count: v.count,
      max: v.max,
    }),
  )

  // ----- Forecast summary (unchanged) -----
  let forecastMean = 0
  let forecastTrend: 'upward' | 'downward' | 'flat' = 'flat'
  if (forecast.length > 0) {
    forecastMean =
      forecast.reduce((a, b) => a + b, 0) / forecast.length
    if (forecast[forecast.length - 1] > forecast[0])
      forecastTrend = 'upward'
    else if (forecast[forecast.length - 1] < forecast[0])
      forecastTrend = 'downward'
  }

  return {
    totals: {
      totalNet,
      totalIncome,
      totalExpense,
      avgDaily:
        dailyVals.length > 0
          ? totalNet / dailyVals.length
          : 0,
    },
    volatility,
    trend: {
      slope,
      direction: trend,
    },
    daily,
    categoryStats,
    forecastSummary: {
      mean: forecastMean,
      trend: forecastTrend,
    },
  }
}

export type SpendingAnalysis = ReturnType<typeof runEDA>
