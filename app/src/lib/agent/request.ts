import 'server-only'
import { verifiedUser } from '@/lib/supabase/verified-user'

// The URL is deployment configuration. Callers supply only the workflow input.
export async function requestAgent(input: Record<string, unknown>) {
  const user = await verifiedUser()
  if (!user) throw new Error('Authentication required')
  const url = process.env.AGENT_SERVICE_URL
  const secret = process.env.AGENT_SERVICE_SECRET
  if (!url || !secret || new URL(url).protocol !== 'https:') {
    throw new Error('Configure an HTTPS agent endpoint and service credential')
  }
  return fetch(url, {
    method: 'POST', redirect: 'error', cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'X-MintSage-User': user.id,
    },
    body: JSON.stringify(input),
  })
}
