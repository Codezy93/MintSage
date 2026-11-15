// components/dashboard/dashboard-shell.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TransactionRecord } from '@/types/transactions'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ForecastChart } from './forecast-chart'
import { EdaPanel } from './eda-panel'
import { ChatPanel, ChatTurn } from './chat-panel'
import { TransactionTable } from '@/components/dashboard/transaction-table'

type Props = {
  initialTransactions: TransactionRecord[]
}

type EDA = any

const INITIAL_QUESTION =
  'What are good things and bad things in the transaction history?'

// helper to build last 60 days from transactions on client
// helper to build last 60 days from transactions on client
function buildLast60Days(
  transactions: TransactionRecord[],
): { user_dates: string[]; user_expenses: number[] } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const toKey = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  const daily = new Map<string, number>()

  // init 60 days window [today-59, ..., today]
  for (let offset = 59; offset >= 0; offset--) {
    const d = new Date(today)
    d.setDate(today.getDate() - offset)
    daily.set(toKey(d), 0)
  }

  // 👉 HERE: treat *positive* values as expenses
  for (const tx of transactions) {
    const d = new Date(tx.created_at)
    d.setHours(0, 0, 0, 0)
    const diff =
      (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (diff < 0 || diff > 59) continue

    const key = toKey(d)
    const expense = tx.amount > 0 ? tx.amount : 0
    daily.set(key, (daily.get(key) ?? 0) + expense)
  }

  return {
    user_dates: Array.from(daily.keys()),
    user_expenses: Array.from(daily.values()),
  }
}

export function DashboardShell({ initialTransactions }: Props) {
  const [forecast, setForecast] = useState<number[]>([])
  const [horizonDates, setHorizonDates] = useState<string[]>([])
  const [eda, setEda] = useState<EDA | null>(null)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transactions = initialTransactions

  const last60 = useMemo(
    () => buildLast60Days(transactions),
    [transactions],
  )

  useEffect(() => {
    async function runPipeline() {
      if (!transactions.length) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 1️⃣ Forecast
        const fRes = await fetch('/api/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_expenses: last60.user_expenses,
            user_dates: last60.user_dates,
          }),
        })
        const fJson = await fRes.json()

        const fArray: number[] = Array.isArray(fJson.forecast)
          ? fJson.forecast
          : []

        setForecast(fArray)
        setHorizonDates(fJson.horizon_dates ?? [])

        // 2️⃣ EDA + init chat
        const aRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions,
            forecast: fArray,
            question: INITIAL_QUESTION,
          }),
        })
        const aJson = await aRes.json()
        if (!aRes.ok) {
          throw new Error(aJson.error || 'Analyze failed')
        }

        setEda(aJson.eda)
        setChat([
          {
            question: INITIAL_QUESTION,
            answer: aJson.answer,
          },
        ])
      } catch (e: any) {
        console.error('[DashboardShell] pipeline error:', e)
        setError(e.message || 'Failed to load insights.')
      } finally {
        setLoading(false)
      }
    }

    runPipeline()
  }, [transactions, last60.user_dates, last60.user_expenses])

  async function handleAsk(question: string) {
    if (!question.trim()) return
    try {
      setSending(true)
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions,
          forecast,
          question,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analyze failed')

      setEda(json.eda)
      setChat((prev) => [
        { question, answer: json.answer },
        ...prev,
      ])
    } catch (e: any) {
      console.error('[DashboardShell] ask error:', e)
      setError(e.message || 'Failed to get answer.')
    } finally {
      setSending(false)
    }
  }

  // full-screen loading state
  if (loading) {
    return (
      <main className="flex-1 container mx-auto px-4 pb-4 pt-3 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-full w-full" />
            </Card>
          ))}
        </div>
      </main>
    )
  }

  if (!transactions.length) {
    return (
      <main className="flex-1 container mx-auto px-4 pb-4 pt-3 overflow-hidden">
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          No transactions yet. Connect your accounts to see insights.
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 container mx-auto px-4 pb-4 pt-3 overflow-hidden">
      {error && (
        <div className="mb-2 text-xs text-red-500">{error}</div>
      )}
      <div className="flex flex-col gap-4 h-full">

        {/* Top-right: EDA */}
        <Card className="p-4 flex flex-col overflow-hidden">
          <EdaPanel eda={eda} transactions={transactions} />
        </Card>

        <Card className="p-4 flex flex-col">
          <ForecastChart
            historyDates={last60.user_dates}
            historyValues={last60.user_expenses}
            forecastDates={horizonDates}
            forecastValues={forecast}
          />
        </Card>

        {/* Bottom-left: Transactions */}
        <Card className="p-4 flex flex-col overflow-hidden">
          <h2 className="text-sm font-semibold mb-2">
            Recent Transactions
          </h2>
          <div className="flex-1 min-h-0 rounded-md border border-border/40 bg-background/40 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <TransactionTable transactions={transactions} />
            </div>
          </div>
        </Card>

        {/* Bottom-right: Chat */}
        <Card className="p-4 flex flex-col overflow-hidden">
          <ChatPanel
            chat={chat}
            onAsk={handleAsk}
            sending={sending}
          />
        </Card>
      </div>
    </main>
  )
}