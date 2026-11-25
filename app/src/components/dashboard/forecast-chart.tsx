// components/dashboard/ForecastChart.tsx
'use client'

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Props = {
  historyDates: string[]
  historyValues: number[]
  forecastDates: string[]
  forecastValues: number[]
}

export function ForecastChart({
  historyDates,
  historyValues,
  forecastDates,
  forecastValues,
}: Props) {
  const data = [
    ...historyDates.map((d, i) => ({
      date: d,
      actual: historyValues[i] ?? 0,
      forecast: null,
    })),
    ...forecastDates.map((d, i) => ({
      date: d,
      actual: null,
      forecast: forecastValues[i] ?? null,
    })),
  ]

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">30-Day Forecast</h2>
      </div>

      {/* ✅ THIS is the fix: explicit height */}
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              minTickGap={16}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#10b981"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#6366f1"
              dot={false}
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
