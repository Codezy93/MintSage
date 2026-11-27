import { verifiedUser } from '@/lib/supabase/verified-user'

async function forward(request: Request) {
  const user = await verifiedUser()
  if (!user)
    return Response.json({ error: 'Sign in required' }, { status: 401 })
  const base = process.env.AGENT_SERVICE_URL,
    secret = process.env.AGENT_SERVICE_SECRET
  if (!base || !secret)
    return Response.json(
      { error: 'The agent service is not configured.' },
      { status: 503 }
    )
  try {
    const url = new URL('/inbox', base)
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
    )
      throw Error()
    url.searchParams.set(
      'offset',
      new URL(request.url).searchParams.get('offset') ?? '0'
    )
    const upstream = await fetch(url, {
      method: request.method,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: 'Bearer ' + secret,
        'X-MintSage-User': user.id,
        'Content-Type': 'application/json',
      },
      body:
        request.method === 'POST'
          ? JSON.stringify(await request.json())
          : undefined,
    })
    if (!upstream.ok)
      return Response.json(
        {
          error:
            upstream.status === 409
              ? 'This finding has changed. Refresh the inbox.'
              : 'Unable to complete the inbox request.',
        },
        { status: upstream.status }
      )
    return Response.json(await upstream.json(), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return Response.json(
      { error: 'Agent service unavailable.' },
      { status: 503 }
    )
  }
}
export const GET = forward
export const POST = forward
