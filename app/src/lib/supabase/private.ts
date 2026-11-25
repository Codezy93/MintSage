import 'server-only'

import { createClient } from '@supabase/supabase-js'
export function privateClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URI!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

