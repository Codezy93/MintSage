import { NextResponse } from 'next/server'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'

import { getGroqClient } from '@/lib/groq/config'

type IncomingMessage = {
  role?: 'user' | 'assistant'
  content?: string
}

type ChatRequest = {
  messages?: IncomingMessage[]
}

const MAX_HISTORY_MESSAGES = 12

const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are MintSage AI, a personable financial coach. Share clear, structured budgets, savings ideas, and spending insights based only on the details a user provides. Offer 2-4 concise action items when possible, highlight important numbers, and ask clarifying questions when context is missing.`,
  ],
  new MessagesPlaceholder('history'),
  ['human', '{input}'],
])

let cachedChain: ReturnType<typeof buildChain> | null = null

function buildChain() {
  const llm = getGroqClient()
  return prompt.pipe(llm).pipe(new StringOutputParser())
}

function getChain() {
  if (!cachedChain) {
    cachedChain = buildChain()
  }
  return cachedChain
}

export async function POST(req: Request) {
  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as ChatRequest
    const incoming = Array.isArray(body.messages) ? body.messages : []

    if (!incoming.length) {
      return NextResponse.json({ error: 'No chat messages provided' }, { status: 400 })
    }

    const cleaned = incoming
      .map((message) => {
        if (!message) return null
        if (message.role !== 'user' && message.role !== 'assistant') return null
        if (typeof message.content !== 'string') return null
        const trimmed = message.content.trim()
        if (!trimmed) return null
        return { role: message.role, content: trimmed }
      })
      .filter(
        (message): message is { role: 'user' | 'assistant'; content: string } => Boolean(message),
      )
      .slice(-MAX_HISTORY_MESSAGES)

    if (!cleaned.length) {
      return NextResponse.json({ error: 'No valid chat messages found' }, { status: 400 })
    }

    const latest = cleaned[cleaned.length - 1]
    if (latest.role !== 'user') {
      return NextResponse.json(
        { error: 'The latest message must come from the user' },
        { status: 400 },
      )
    }

    const history = cleaned
      .slice(0, -1)
      .map((message) =>
        message.role === 'assistant'
          ? new AIMessage(message.content)
          : new HumanMessage(message.content),
      )

    let chain
    try {
      chain = getChain()
    } catch (configError) {
      console.error('Groq client is not configured', configError)
      return NextResponse.json(
        { error: 'MintSage AI is not available. Please configure GROQ_API_KEY.' },
        { status: 500 },
      )
    }

    const reply = await chain.invoke({
      history,
      input: latest.content,
    })

    if (!reply?.trim()) {
      return NextResponse.json({ error: 'Model returned an empty response' }, { status: 500 })
    }

    return NextResponse.json({ reply: reply.trim() })
  } catch (error) {
    console.error('Groq chat route error', error)
    return NextResponse.json({ error: 'Unable to process chat request' }, { status: 500 })
  }
}

