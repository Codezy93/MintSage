import {
  createPublicKey,
  createHash,
  timingSafeEqual,
  verify,
} from 'node:crypto'
import { z } from 'zod'
import { plaidClient } from '@/lib/plaid/config'
import { privateClient } from '@/lib/supabase/private'
import { syncOwner } from '@/lib/transactions/transactions'

async function authentic(jwt: string, body: Buffer) {
  const parts = jwt.split('.')
  if (parts.length !== 3) return false
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  const header = z
    .object({ alg: z.literal('ES256'), kid: z.string().min(1).max(128) })
    .safeParse(decode(parts[0]))
  if (!header.success) return false
  const {
    data: { key },
  } = await plaidClient.webhookVerificationKeyGet(
    { key_id: header.data.kid },
    { timeout: 5000 }
  )
  if (
    key.kid !== header.data.kid ||
    key.expired_at != null ||
    key.crv !== 'P-256' ||
    key.alg !== 'ES256'
  )
    return false
  const publicKey = createPublicKey({
    format: 'jwk',
    key: { kty: 'EC', crv: key.crv, x: key.x, y: key.y },
  })
  if (
    !verify(
      'sha256',
      Buffer.from(parts[0] + '.' + parts[1]),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[2], 'base64url')
    )
  )
    return false
  const payload = z
    .object({
      iat: z.number().int(),
      request_body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(decode(parts[1]))
  if (!payload.success) return false
  const age = Math.floor(Date.now() / 1000) - payload.data.iat
  return (
    age >= 0 &&
    age <= 300 &&
    timingSafeEqual(
      createHash('sha256').update(body).digest(),
      Buffer.from(payload.data.request_body_sha256, 'hex')
    )
  )
}
export async function POST(req: Request) {
  const body = Buffer.from(await req.arrayBuffer())
  try {
    if (!(await authentic(req.headers.get('Plaid-Verification') ?? '', body)))
      return new Response(null, { status: 401 })
  } catch {
    return new Response(null, { status: 401 })
  }
  try {
    const payload = z
      .object({
        webhook_type: z.string(),
        webhook_code: z.string(),
        item_id: z.string(),
      })
      .parse(JSON.parse(body.toString()))
    if (
      payload.webhook_type === 'TRANSACTIONS' &&
      payload.webhook_code === 'SYNC_UPDATES_AVAILABLE'
    ) {
      const row = await privateClient()
        .from('plaid_tokens')
        .select('id')
        .eq('item_id', payload.item_id)
        .maybeSingle()
      if (row.error) throw Error()
      if (row.data) await syncOwner(row.data.id, payload.item_id)
    }
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 503 })
  }
}
