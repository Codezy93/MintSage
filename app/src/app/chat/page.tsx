'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Sparkles, Send, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const suggestedQuestions = [
  'How can I reduce my spending on dining out?',
  'What are my biggest spending categories?',
  'Create a budget plan for next month',
  'Compare my spending to last month',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm SpendSage AI, your personal financial assistant. I can help you understand your spending patterns, create budgets, and provide personalized tips to save more money. How can I help you today?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    }

    const updatedMessages = [...messages, userMessage]

    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        reply?: string
        error?: string
      }

      if (!response.ok || typeof data.reply !== 'string') {
        throw new Error(data.error || 'Unable to get a response from SpendSage AI right now.')
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply.trim(),
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (err) {
      console.error('Chat request failed', err)
      const errorMessage =
        err instanceof Error ? err.message : 'Something went wrong. Please try again later.'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    e?.preventDefault()
    await sendMessage()
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
    setError(null)
    textareaRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950 dark:via-teal-950 dark:to-cyan-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-background/70 border-b border-emerald-200/50 dark:border-emerald-800/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/dashboard">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Sparkles className="size-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold">SpendSage AI</h1>
                <p className="text-xs text-muted-foreground">Financial Assistant</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 container mx-auto px-4 py-6 max-w-4xl">
        <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-280px)]">
          <div className="space-y-6 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="size-10 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                    <Sparkles className="size-5 text-white" />
                  </div>
                )}
                <Card
                  className={`max-w-[80%] p-4 ${
                    message.role === 'user'
                      ? 'bg-linear-to-br from-emerald-500 to-teal-600 text-white border-0'
                      : 'bg-white/80 dark:bg-background/80 backdrop-blur-sm border-emerald-200/50 dark:border-emerald-800/50'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  <p
                    className={`text-xs mt-2 ${
                      message.role === 'user' ? 'text-emerald-100' : 'text-muted-foreground'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </Card>
                {message.role === 'user' && (
                  <div className="size-10 rounded-xl bg-linear-to-br from-teal-500 to-cyan-600 flex items-center justify-center shrink-0 text-white font-semibold">
                    You
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="size-10 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                  <Sparkles className="size-5 text-white" />
                </div>
                <Card className="p-4 bg-white/80 dark:bg-background/80 backdrop-blur-sm border-emerald-200/50 dark:border-emerald-800/50">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-emerald-600" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length === 1 && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-3">Suggested questions:</p>
            <div className="grid md:grid-cols-2 gap-3">
              {suggestedQuestions.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  className="justify-start text-left h-auto py-3 px-4 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  onClick={() => handleSuggestedQuestion(question)}
                >
                  <span className="text-sm leading-relaxed">{question}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 border-t border-emerald-200/50 dark:border-emerald-800/50 bg-white/70 dark:bg-background/70 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (error) {
                  setError(null)
                }
              }}
              placeholder="Ask me anything about your finances..."
              className="min-h-[60px] max-h-[120px] resize-none bg-white dark:bg-background"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="size-[60px] bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 shrink-0"
              disabled={!input.trim() || isLoading}
            >
              <Send className="size-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}


