import { countsAsSpending, type TransactionRecord } from '@/types/transactions'

export function buildLast60Days(transactions: TransactionRecord[], today = new Date()) {
  const daily = new Map<string, number>()
  for (let offset = 59; offset >= 0; offset--) {
    const day = new Date(today)
    day.setUTCDate(today.getUTCDate() - offset)
    daily.set(day.toISOString().slice(0, 10), 0)
  }
  for (const tx of transactions) {
    if (tx.currency === 'USD' && countsAsSpending(tx) && daily.has(tx.date)) {
      daily.set(tx.date, daily.get(tx.date)! + tx.amount)
    }
  }
  return { user_dates: [...daily.keys()], user_expenses: [...daily.values()] }
}

// expenses-only pie: positive amounts (since negative = income)
export function buildCategoryData(transactions: TransactionRecord[]) {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (!countsAsSpending(tx)) continue
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount)
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

// More computed insights (client-side from transactions)
export function computeExtraInsights(transactions: TransactionRecord[]) {
  let totalExpense = 0
  let totalIncome = 0

  const dayExpense = new Map<string, number>() // positive only
  const dayIncome = new Map<string, number>() // abs(negative) only
  const vendorCount = new Map<string, number>()
  const categoryCount = new Map<string, number>()
  const categoryExpense = new Map<string, number>()

  for (const tx of transactions) {
    const day = tx.date
    const vendor = tx.vendor ?? 'Unknown'
    const cat = tx.category ?? 'UNKNOWN'

    vendorCount.set(vendor, (vendorCount.get(vendor) ?? 0) + 1)
    categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1)

    if (countsAsSpending(tx)) {
      totalExpense += tx.amount
      dayExpense.set(day, (dayExpense.get(day) ?? 0) + tx.amount)
      categoryExpense.set(cat, (categoryExpense.get(cat) ?? 0) + tx.amount)
    } else if (!tx.pending && tx.kind === 'income') {
      const inc = -tx.amount
      totalIncome += inc
      dayIncome.set(day, (dayIncome.get(day) ?? 0) + inc)
    }
  }

  const expenseDays = Array.from(dayExpense.entries())
  const incomeDays = Array.from(dayIncome.entries())

  const largestExpenseDay = expenseDays.sort((a, b) => b[1] - a[1])[0] ?? null
  const largestIncomeDay = incomeDays.sort((a, b) => b[1] - a[1])[0] ?? null

  const topSpendCats = Array.from(categoryExpense.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }))

  const mostFrequentVendor =
    Array.from(vendorCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'

  const mostFrequentCategory =
    Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'

  const uniqueDays = new Set(transactions.map((t) => t.date))
  const numActiveDays = uniqueDays.size || 1

  const avgExpensePerActiveDay = totalExpense / numActiveDays
  const avgIncomePerActiveDay = totalIncome / numActiveDays
  const expenseIncomeRatio = totalIncome > 0 ? totalExpense / totalIncome : null

  const net = totalIncome - totalExpense

  // simple “flags”
  const flags: string[] = []
  if (net < 0) flags.push('Net is negative (spending > income).')
  if (expenseIncomeRatio !== null && expenseIncomeRatio > 1)
    flags.push('Expenses exceed income (ratio > 1).')

  return {
    totalExpense,
    totalIncome,
    net,
    avgExpensePerActiveDay,
    avgIncomePerActiveDay,
    expenseIncomeRatio,
    largestExpenseDay,
    largestIncomeDay,
    mostFrequentVendor,
    mostFrequentCategory,
    topSpendCats,
    flags,
  }
}
