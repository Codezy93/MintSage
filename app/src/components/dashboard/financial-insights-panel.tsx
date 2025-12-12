// components/dashboard/financial-insights-panel.tsx
'use client'

import { useEffect, useState } from 'react'
import { TransactionRecord } from '@/app/dashboard/page'
import { Skeleton } from '@/components/ui/skeleton'
import { Pie, PieChart, Cell, Tooltip, ResponsiveContainer } from 'recharts'

type EDA = {
  totals: {
    totalNet: number
    totalIncome: number
    totalExpense: number
    avgDaily: number
  }
  volatility: number
  trend: {
    slope: number
    direction: 'increasing' | 'decreasing' | 'flat'
  }
  categoryEntropy: number | null
  runwayDays: number | null
}

type Props = {
  transactions: TransactionRecord[]
}

const PIE_COLORS = [
  '#10b981',
  '#0ea5e9',
  '#6366f1',
  '#f97316',
  '#fbbf24',
  '#ec4899',
  '#22c55e',
  '#a855f7',
]

// build category sums (expenses only)
function buildCategoryData(transactions: TransactionRecord[]) {
  const map = new Map<string, number>()

  for (const tx of transactions) {
    // negative = income, positive = expense
    if (tx.amount <= 0) continue

    const v = tx.amount // ✅ expense as-is (positive)
    map.set(tx.category, (map.get(tx.category) ?? 0) + v)
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

export function FinancialInsightsPanel({ transactions }: Props) {
  const [eda, setEda] = useState<EDA | null>(null)
  const [loading, setLoading] = useState(true)

  const pieData = buildCategoryData(transactions)

  useEffect(() => {
    const run = async () => {
      if (!transactions.length) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions,
            forecast: [], // okay now, backend accepts empty
            question:
              'Return only numeric EDA metrics, no advice or explanation.',
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Analyze failed')

        setEda(json.eda)
      } catch (e) {
        // if /api/analyze fails, just skip showing error text – keep UI clean
        console.error('[FinancialInsightsPanel] EDA error:', e)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [transactions])

  if (loading) return <Skeleton className="h-full w-full" />

  if (!transactions.length) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        No transactions yet.
      </div>
    )
  }

  return (
    <div className="h-full grid grid-cols-2 gap-3 text-xs">
      {/* Left: numeric tiles */}
      <div className="flex flex-col gap-2">
        {eda ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div className="text-[10px] text-muted-foreground">
                  Total Net
                </div>
                <div className="font-semibold text-sm">
                  {eda.totals.totalNet.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div className="text-[10px] text-muted-foreground">
                  Income
                </div>
                <div className="font-semibold text-sm">
                  {eda.totals.totalIncome.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div className="text-[10px] text-muted-foreground">
                  Expense
                </div>
                <div className="font-semibold text-sm">
                  {eda.totals.totalExpense.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div className="text-[10px] text-muted-foreground">
                  Avg Daily Net
                </div>
                <div className="font-semibold text-sm">
                  {eda.totals.avgDaily.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-1 space-y-1">
              <div className="text-[11px] text-muted-foreground">
                Trend:{' '}
                <span className="font-medium">
                  {eda.trend.direction}
                </span>{' '}
                (slope {eda.trend.slope})
              </div>
              <div className="text-[11px] text-muted-foreground">
                Volatility:{' '}
                <span className="font-medium">
                  {eda.volatility.toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Diversity (entropy):{' '}
                {eda.categoryEntropy === null
                  ? 'N/A'
                  : eda.categoryEntropy.toFixed(3)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Runway days:{' '}
                {eda.runwayDays === null
                  ? 'N/A'
                  : eda.runwayDays.toFixed(1)}
              </div>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            EDA not available.
          </p>
        )}
      </div>

      {/* Right: category pie */}
      <div className="flex flex-col">
        <div className="text-[11px] font-medium mb-1">
          Category-wise Split
        </div>
        <div className="flex-1 min-h-0">
          {pieData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
              No expense categories yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius="80%"
                  innerRadius="50%"
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [
                    typeof value === 'number'
                      ? value.toFixed(2)
                      : value,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}