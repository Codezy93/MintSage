'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

export type TransactionRecord = {
  id: string
  created_at: string
  amount: number
  vendor: string
  category: string
}

type EDA = any // Full EDA type from analyze route

type ChatTurn = {
  question: string
  answer: string
}

type InsightsPanelProps = {
  transactions: TransactionRecord[]
}

const INITIAL_Q = 'What are good things and bad things in the transaction history?'

export function InsightsPanel({ transactions }: InsightsPanelProps) {
  const [forecast, setForecast] = useState<number[]>([])
  const [eda, setEda] = useState<EDA | null>(null)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState(INITIAL_Q)

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  //--------------------------------------
  // Load forecast + run initial analysis
  //--------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)

        // 1. Fetch 60-day forecast
        const res = await fetch('/api/forecast', { method: 'POST' })
        const json = await res.json()

        let f: number[] = []

        // Try different possible shapes
        if (Array.isArray(json.forecast)) f = json.forecast
        else if (json.forecast?.values && Array.isArray(json.forecast.values))
          f = json.forecast.values
        else if (json.input?.user_expenses) f = json.input.user_expenses

        setForecast(f)

        // 2. Call analyzer backend with first question
        const analyze = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions,
            forecast: f ?? [],
            question: INITIAL_Q,
          }),
        })

        const ajson = await analyze.json()

        if (!analyze.ok) throw new Error(ajson.error || 'Analyze failed')

        setEda(ajson.eda)
        setChat([{ question: INITIAL_Q, answer: ajson.answer }])
      } catch (e: any) {
        console.error('InsightsPanel init error:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    if (transactions.length > 0) load()
    else setLoading(false)
  }, [transactions])

  //--------------------------------------
  // Handle user asking new question
  //--------------------------------------
  async function ask(e: React.FormEvent) {
    e.preventDefault()

    if (!question.trim()) return

    try {
      setSending(true)

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions,
          forecast, // OK even if empty
          question,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analyze failed')

      setChat((prev) => [{ question, answer: json.answer }, ...prev])
      setEda(json.eda)
      setQuestion('')
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  //--------------------------------------
  // RENDER
  //--------------------------------------

  if (loading) return <Skeleton className="h-96 w-full" />

  if (!transactions.length)
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          No transactions available yet.
        </p>
      </Card>
    )

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------- EDA SECTION ---------------------- */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Financial Insights</h2>

        {error && (
          <p className="text-xs text-red-500 mb-2">{error}</p>
        )}

        {!eda ? (
          <p className="text-sm text-muted-foreground">
            No EDA computed.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            {/* Top Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg">
                <div className="text-xs">Total Net</div>
                <div className="font-semibold">
                  {eda.totals.totalNet}
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg">
                <div className="text-xs">Income</div>
                <div className="font-semibold">
                  {eda.totals.totalIncome}
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg">
                <div className="text-xs">Expense</div>
                <div className="font-semibold">
                  {eda.totals.totalExpense}
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg">
                <div className="text-xs">Avg Daily Net</div>
                <div className="font-semibold">
                  {eda.totals.avgDaily}
                </div>
              </div>
            </div>

            {/* Trend */}
            <div className="text-xs text-muted-foreground">
              Trend: {eda.trend.direction}  
              (slope {eda.trend.slope})
            </div>

            {/* Volatility */}
            <div className="text-xs text-muted-foreground">
              Volatility: {eda.volatility}
            </div>

            {/* Forecast */}
            <div className="text-xs text-muted-foreground">
              Forecast mean: {eda.forecastSummary.mean} <br />
              Forecast trend: {eda.forecastSummary.trend} <br />
              Forecast bias: {eda.forecastSummary.bias}
            </div>

            {/* Entropy */}
            <div className="text-xs text-muted-foreground">
              Spending diversity (entropy):{' '}
              {eda.categoryEntropy ?? 'N/A'}
            </div>

            {/* Runway */}
            <div className="text-xs text-muted-foreground">
              Runway days: {eda.runwayDays ?? 'N/A'}
            </div>
          </div>
        )}
      </Card>

      {/* ---------------------- CHAT SECTION ---------------------- */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Ask a Question</h2>

        <form onSubmit={ask} className="space-y-2">
          <Textarea
            className="min-h-[80px]"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your finances, spending, or trends…"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={sending}>
              {sending ? 'Analyzing…' : 'Ask'}
            </Button>
          </div>
        </form>

        <div className="border-t pt-3 space-y-3 max-h-[300px] overflow-y-auto text-sm">
          {chat.map((turn, i) => (
            <div key={i} className="space-y-1">
              <div className="text-xs font-semibold text-emerald-700">
                You:
              </div>
              <div className="bg-muted px-2 py-1 rounded-md">
                {turn.question}
              </div>

              <div className="text-xs font-semibold mt-1">AI:</div>
              <div className="border px-2 py-1 rounded-md bg-background">
                {turn.answer}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
