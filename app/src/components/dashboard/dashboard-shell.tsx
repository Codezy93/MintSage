// components/dashboard/dashboard-shell.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SpendingAnalysis } from '@/lib/transactions/analysis'
import { projection } from '@/lib/transactions/contracts'
import { buildLast60Days } from '@/lib/transactions/aggregation'
import type { TransactionRecord } from '@/types/transactions'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ForecastChart } from './forecast-chart'
import { EdaPanel } from './eda-panel'
import { ChatPanel, ChatTurn } from './chat-panel'
import { TransactionTable } from '@/components/dashboard/transaction-table'

type Props = {
  initialTransactions: TransactionRecord[]
  historyReady: boolean
}



const INITIAL_QUESTION =
  'What are good things and bad things in the transaction history?'

export function DashboardShell({ initialTransactions, historyReady }: Props) {
  const [forecast, setForecast] = useState<number[]>([])
  const [horizonDates, setHorizonDates] = useState<string[]>([])
  const [eda, setEda] = useState<SpendingAnalysis | null>(null)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transactions = useMemo(() => initialTransactions.filter(tx => tx.currency === 'USD'), [initialTransactions])

  const last60 = useMemo(
    () => buildLast60Days(transactions),
    [transactions],
  )

  useEffect(() => {
    async function runPipeline() {
      if (!transactions.length || !historyReady) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        setForecast([])
        setHorizonDates([])

        // 1️⃣ Forecast
        const fRes = await fetch('/api/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency: 'USD',
            user_expenses: last60.user_expenses,
            user_dates: last60.user_dates,
          }),
        })
        const fJson = await fRes.json()
        if (!fRes.ok) throw new Error(fJson.error || 'Forecast unavailable')

        const predicted = projection.safeParse(fJson)
        if (!predicted.success) throw new Error('Invalid forecast response')
        const fArray = predicted.data.forecast
        setForecast(fArray)
        setHorizonDates(predicted.data.horizon_dates)

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
      } catch (e: unknown) {
        console.error('[DashboardShell] pipeline error:', e)
        setError(e instanceof Error ? e.message : 'Failed to load insights.')
      } finally {
        setLoading(false)
      }
    }

    runPipeline()
  }, [historyReady, transactions, last60.user_dates, last60.user_expenses])

  async function handleAsk(question: string) {
    if (!historyReady || !question.trim()) return
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
    } catch (e: unknown) {
      console.error('[DashboardShell] ask error:', e)
      setError(e instanceof Error ? e.message : 'Failed to get answer.')
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

  if (!initialTransactions.length) {
    return (
      <main className="flex-1 container mx-auto px-4 pb-4 pt-3 overflow-hidden">
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          {historyReady ? 'No transactions in the available history.' : 'Complete, current USD history is unavailable.'}
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 container mx-auto px-4 pb-4 pt-3 overflow-hidden">
      {!transactions.length && <p>There are no USD transactions to analyze.</p>}
      {!historyReady && <p>Insights unavailable until current, complete 60-day history is available for each USD account.</p>}
      {error && (
        <div className="mb-2 text-xs text-red-500">{error}</div>
      )}
      <div className="flex flex-col gap-4 h-full">

        {/* Top-right: EDA */}
        <Card className="p-4 flex flex-col overflow-hidden">
          {historyReady && transactions.length > 0 && <EdaPanel eda={eda} transactions={transactions} />}
        </Card>

        <Card className="p-4 flex flex-col">
          {historyReady && transactions.length > 0 && <ForecastChart
            historyDates={last60.user_dates}
            historyValues={last60.user_expenses}
            forecastDates={horizonDates}
            forecastValues={forecast}
          />}
        </Card>

        {/* Bottom-left: Transactions */}
        <Card className="p-4 flex flex-col overflow-hidden">
          <h2 className="text-sm font-semibold mb-2">
            Recent Transactions
          </h2>
          <div className="flex-1 min-h-0 rounded-md border border-border/40 bg-background/40 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <TransactionTable transactions={initialTransactions} />
            </div>
          </div>
        </Card>

        {/* Bottom-right: Chat */}
        <Card className="p-4 flex flex-col overflow-hidden">
          {historyReady && transactions.length > 0 && <ChatPanel
            chat={chat}
            onAsk={handleAsk}
            sending={sending}
          />}
        </Card>
      </div>
    </main>
  )
}