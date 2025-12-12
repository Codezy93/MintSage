// components/dashboard/chat-panel.tsx
'use client'

import { useEffect, useState } from 'react'
import { TransactionRecord } from '@/app/dashboard/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ChatTurn = {
  question: string
  answer: string
}

type Props = {
  transactions: TransactionRecord[]
}

const INITIAL_Q =
  'What are good things and bad things in the transaction history?'

export function ChatPanel({ transactions }: Props) {
  const [forecast, setForecast] = useState<number[]>([])
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState<string>(INITIAL_Q)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initial load: forecast + first answer
  useEffect(() => {
    const run = async () => {
      if (!transactions.length) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 1) Get forecast (safe parsing)
        const fRes = await fetch('/api/forecast', { method: 'POST' })
        const fJson = await fRes.json()

        let f: number[] = []

        if (Array.isArray(fJson.forecast)) f = fJson.forecast
        else if (Array.isArray(fJson?.forecast?.values))
          f = fJson.forecast.values
        else if (Array.isArray(fJson?.input?.user_expenses))
          f = fJson.input.user_expenses

        setForecast(f)

        // 2) Ask initial question
        const aRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions,
            forecast: f ?? [],
            question: INITIAL_Q,
          }),
        })
        const aJson = await aRes.json()
        if (!aRes.ok) throw new Error(aJson.error || 'Analyze failed')

        setChat([
          {
            question: INITIAL_Q,
            answer: aJson.answer,
          },
        ])
      } catch (e: any) {
        console.error('[ChatPanel init]', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [transactions])

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return

    try {
      setSending(true)
      setError(null)

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

      setChat((prev) => [
        { question, answer: json.answer },
        ...prev,
      ])
      setQuestion('')
    } catch (e: any) {
      console.error('[ChatPanel ask]', e)
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        Loading AI insights…
      </div>
    )
  }

  if (!transactions.length) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        Connect your accounts or add transactions to start chatting with the AI.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-3 text-sm">
      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      {/* Question input */}
      <form onSubmit={handleAsk} className="space-y-2">
        <Textarea
          className="min-h-[70px]"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your spending, risk, or trends…"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={sending}>
            {sending ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
      </form>

      {/* Chat history */}
      <div className="flex-1 min-h-0 border-t pt-2 overflow-y-auto space-y-3">
        {chat.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No answers yet.
          </p>
        ) : (
          chat.map((turn, i) => (
            <div key={i} className="space-y-1">
              <div className="text-[11px] font-semibold text-emerald-700">
                You
              </div>
              <div className="rounded-md bg-muted px-2 py-1">
                {turn.question}
              </div>
              <div className="text-[11px] font-semibold mt-1">AI</div>
              <div className="rounded-md bg-background border px-2 py-1">
                {turn.answer}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}