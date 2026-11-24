import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

function tokenTable() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URI!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).from('plaid_tokens')
}

export async function savePlaidToken(user: User, token: string) {
  const { error } = await tokenTable().upsert({ id: user.id, token })
  if (error) {
    throw new Error('Failed to store Plaid connection')
  }
}

export async function getPlaidToken(user: User) {
  const { data, error } = await tokenTable()
    .select('token')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw new Error('Failed to read Plaid connection')
  }

  return data?.token || null
}
