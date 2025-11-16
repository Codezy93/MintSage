import { ChatGroq } from '@langchain/groq'

let cachedClient: ChatGroq | null = null

export function getGroqClient(): ChatGroq {
  if (cachedClient) {
    return cachedClient
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  cachedClient = new ChatGroq({
    apiKey,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    maxRetries: 2,
  })

  return cachedClient
}
