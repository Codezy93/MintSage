// components/dashboard/ChatPanel.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

export type ChatTurn = {
  question: string
  answer: string
}

type Props = {
  chat: ChatTurn[]
  onAsk: (question: string) => Promise<void> | void
  sending: boolean
}

export function ChatPanel({ chat, onAsk, sending }: Props) {
  const [question, setQuestion] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    await onAsk(question)
    setQuestion('')
  }

  return (
    <div className="flex flex-col h-full gap-3 text-sm">
      <h2 className="text-sm font-semibold">AI Chat</h2>

      <form onSubmit={handleSubmit} className="space-y-2">
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