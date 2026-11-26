'use client'

import type { SpendingAnalysis } from '@/lib/transactions/analysis'
import { buildCategoryData, computeExtraInsights } from '@/lib/transactions/aggregation'
import type { TransactionRecord } from '@/types/transactions'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

type Props = {
  eda: SpendingAnalysis | null
  transactions: TransactionRecord[]
}

const categoryColors: Record<string, string> = {
  INCOME: '#10b981',
  TRANSFER_IN: '#14b8a6',
  TRANSFER_OUT: '#0ea5e9',
  LOAN_PAYMENTS: '#f59e0b',
  BANK_FEES: '#f43f5e',
  ENTERTAINMENT: '#a855f7',
  FOOD_AND_DRINK: '#f97316',
  GENERAL_MERCHANDISE: '#ec4899',
  HOME_IMPROVEMENT: '#84cc16',
  MEDICAL: '#ef4444',
  PERSONAL_CARE: '#d946ef',
  GENERAL_SERVICES: '#78716c',
  GOVERNMENT_AND_NON_PROFIT: '#6366f1',
  TRANSPORTATION: '#3b82f6',
  TRAVEL: '#06b6d4',
  RENT_AND_UTILITIES: '#8b5cf6',
}

const FALLBACK_COLORS = [
  '#10b981',
  '#0ea5e9',
  '#6366f1',
  '#f97316',
  '#fbbf24',
  '#ec4899',
  '#22c55e',
  '#a855f7',
]

function getSliceColor(category: string, idx: number) {
  return categoryColors[category] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return 'N/A'
  return n.toFixed(2)
}

export function EdaPanel({ eda, transactions }: Props) {
  const pieData = buildCategoryData(transactions)
  const extra = computeExtraInsights(transactions)

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Calculated EDA</h2>
        <span className="text-xs text-muted-foreground">
          Based on your transaction history
        </span>
      </div>

      {!eda ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          EDA not available.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* LEFT: tiles + details */}
          <div className="space-y-4">
            {/* Tiles */}
            {/* Tiles – stacked */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-5">
              <div className="text-sm text-muted-foreground">Total Net</div>
              <div className="font-semibold text-2xl">
                {fmt(eda.totals.totalNet)}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-5">
              <div className="text-sm text-muted-foreground">Income</div>
              <div className="font-semibold text-2xl">
                {fmt(eda.totals.totalIncome)}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-5">
              <div className="text-sm text-muted-foreground">Expense</div>
              <div className="font-semibold text-2xl">
                {fmt(eda.totals.totalExpense)}
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-5">
              <div className="text-sm text-muted-foreground">Avg Daily Net</div>
              <div className="font-semibold text-2xl">
                {fmt(eda.totals.avgDaily)}
              </div>
            </div>
          </div>

            {/* More EDA insights */}
            <div className="rounded-lg border bg-background/60 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trend</span>
                <span className="font-medium">
                  {eda.trend.direction} (slope {Number(eda.trend.slope).toFixed(4)})
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Volatility</span>
                <span className="font-medium">{fmt(eda.volatility)}</span>
              </div>

              {eda.forecastSummary && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Experimental forecast mean</span>
                  <span className="font-medium">
                    {fmt(eda.forecastSummary.mean)} ({eda.forecastSummary.trend})
                  </span>
                </div>
              )}

              <div className="border-t pt-2 mt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg expense / active day</span>
                  <span className="font-medium">{fmt(extra.avgExpensePerActiveDay)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg income / active day</span>
                  <span className="font-medium">{fmt(extra.avgIncomePerActiveDay)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expense / income ratio</span>
                  <span className="font-medium">
                    {extra.expenseIncomeRatio === null ? 'N/A' : extra.expenseIncomeRatio.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Most frequent vendor</span>
                  <span className="font-medium">{extra.mostFrequentVendor}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Most frequent category</span>
                  <span className="font-medium">{extra.mostFrequentCategory}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Largest expense day</span>
                  <span className="font-medium">
                    {extra.largestExpenseDay ? `${extra.largestExpenseDay[0]} (${fmt(extra.largestExpenseDay[1])})` : 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Largest income day</span>
                  <span className="font-medium">
                    {extra.largestIncomeDay ? `${extra.largestIncomeDay[0]} (${fmt(extra.largestIncomeDay[1])})` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Flags */}
              {extra.flags.length > 0 && (
                <div className="border-t pt-2 mt-2">
                  <div className="text-xs font-semibold text-rose-600 mb-1">Flags</div>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                    {extra.flags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Top spend categories list */}
            {extra.topSpendCats.length > 0 && (
              <div className="rounded-lg border bg-background/60 p-4">
                <div className="text-sm font-semibold mb-2">Top Spending Categories</div>
                <div className="space-y-2">
                  {extra.topSpendCats.map((c) => (
                    <div key={c.category} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="font-medium">{fmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: pie chart */}
          <div className="rounded-lg border bg-background/60 p-4">
            <div className="text-sm font-semibold mb-2">Category-wise Split (Expenses)</div>
            <div className="h-[420px] w-full">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No expense categories yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius="90%"
                      innerRadius="55%"
                      paddingAngle={2}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={getSliceColor(entry.name, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [
                        typeof v === 'number' ? v.toFixed(2) : v,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}