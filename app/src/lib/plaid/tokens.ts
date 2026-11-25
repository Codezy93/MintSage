import 'server-only'
import type { User } from '@supabase/supabase-js'
import { privateClient } from '../supabase/private'

export async function savePlaidToken(user: User, token: string) {
  const { error } = await privateClient().from('plaid_tokens').upsert({ id: user.id, token, sync_cursor: null, transactions: {}, sync_revision: 0 })
  if (error) {
    throw new Error('Failed to store Plaid connection')
  }
}
