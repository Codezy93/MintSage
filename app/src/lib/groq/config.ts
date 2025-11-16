import { ChatGroq } from '@langchain/groq'

const apiKey = process.env.GROQ_API_KEY

if (!apiKey) {
  throw new Error('GROQ_API_KEY is not configured')
}

const llm = new ChatGroq({
  apiKey,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  maxRetries: 2,
})

export default llm
