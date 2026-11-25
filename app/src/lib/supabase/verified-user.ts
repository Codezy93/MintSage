import 'server-only'
import { createClient } from './server'

export async function verifiedUser() {
  const client = await createClient()
  const { data, error } = await client.auth.getUser()
  return error ? null : data.user
}
