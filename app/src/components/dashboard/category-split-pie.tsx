// components/dashboard/category-split-pie.tsx
'use client'

import { Pie, PieChart, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { TransactionRecord } from '@/app/dashboard/page'

const COLORS = [
  '#10b981',
  '#0ea5e9',
  '#6366f1',
  '#f97316',
  '#facc15',
  '#ec4899',
  '#22c55e',
  '#a855f7',
]

type CategorySplitPieProps = {
  transactions: TransactionRecord[]
}

export function CategorySplitPie({ transactions }: CategorySplitPieProps) {
  // 👉 aggregate by category (expenses only = positive amounts)
  const totals = new Map<string, number>()

  for (const tx of transactions) {
    // your convention: negative = income, positive = expense
    if (tx.amount >= 0) continue // skip incomes

    const expense = tx.amount
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + expense)
  }

  const data = Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8) // top categories

  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
        No expense categories yet.
      </div>
    )
  }

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            outerRadius="80%"
            innerRadius="50%"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [
              typeof value === 'number' ? value.toFixed(2) : value,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}