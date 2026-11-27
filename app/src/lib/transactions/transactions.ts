import 'server-only'
import { redirect } from 'next/navigation'
import { normalize } from '@/lib/transactions/normalize'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { privateClient } from '@/lib/supabase/private'
import { plaidClient } from '@/lib/plaid/config'
import type { TransactionRecord } from '@/types/transactions'

export default async function getTransactions() {
  const user = await verifiedUser()
  if (!user) redirect('/login')
  const result=await syncOwner(user.id)
  if(!result) redirect('/plaid-connect')
  return result
}

// Dashboard calls bind a session owner. Webhook calls also require the signed Item ID.
export async function syncOwner(owner:string, itemId?:string) {
  const db = privateClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from('plaid_tokens')
      .select('token,item_id,sync_cursor,sync_revision,transactions').eq('id', owner).maybeSingle()
    if (error) throw new Error('Unable to read transaction history')
    if (!data?.token || (itemId && data.item_id!==itemId)) return null
    const changes = new Map<string, TransactionRecord>()
    const removed = new Set<string>()
    const replacedPending = new Set<string>()
    const remove = (id: string) => {
      changes.delete(id)
      removed.add(id)
    }
    let cursor: string | undefined = data.sync_cursor ?? undefined
    let ready = false
    try {
      while (true) {
        const page = (await plaidClient.transactionsSync({
          access_token: data.token, cursor, count: 500,
          options: { days_requested: 365, include_personal_finance_category: true },
        })).data
        for (const tx of [...page.added, ...page.modified]) {
          if (tx.pending_transaction_id) replacedPending.add(tx.pending_transaction_id)
          changes.set(tx.transaction_id, normalize(tx))
          removed.delete(tx.transaction_id)
        }
        for (const tx of page.removed) remove(tx.transaction_id)
        ready = page.transactions_update_status === 'HISTORICAL_UPDATE_COMPLETE'
        if (page.has_more && (!page.next_cursor || page.next_cursor === cursor)) throw new Error('Pagination stalled')
        cursor = page.next_cursor
        if (!page.has_more) break
      }
    } catch (error) {
      const provider = error as { response?: { data?: { error_code?: string } } }
      if (provider.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') continue
      throw new Error('Transaction sync failed. Refresh to retry.')
    }
    for (const id of replacedPending) remove(id)
    const { data: committed, error: writeError } = await db.rpc('commit_transaction_sync', {
      owner_id: owner, expected_token: data.token, revision: data.sync_revision,
      next_cursor: cursor || null, changes: Object.fromEntries(changes), removed: [...removed],
    })
    if (writeError) throw new Error('Unable to persist transaction sync')
    if (!committed) continue
    const snapshot = new Map(Object.entries(data.transactions as Record<string, TransactionRecord>))
    for (const id of removed) snapshot.delete(id)
    for (const [id, tx] of changes) snapshot.set(id, tx)
    const transactions = [...snapshot.values()].sort((a,b) => b.date.localeCompare(a.date))
    const status = await plaidClient.itemGet({ access_token: data.token })
    const updated = status.data.status?.transactions?.last_successful_update
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 59)
    const oldest = new Map<string, string>()
    for (const tx of transactions) {
      if (tx.currency === 'USD') oldest.set(tx.accountId, tx.date)
    }
    const fresh = !!updated && Date.now() - Date.parse(updated) <= 48 * 3600_000
    const covered = [...oldest.values()].every(date => date <= cutoff.toISOString().slice(0, 10))
    const stamp = await db.from('plaid_tokens').update({
      ...(status.data.item?.item_id ? {item_id:status.data.item.item_id}:{}),
      history_checked: updated ?? null, history_ready: ready && fresh && covered,
    }).eq('id', owner).eq('sync_revision', data.sync_revision + 1).eq('token', data.token)
    if (stamp.error) throw new Error('Unable to record transaction freshness')
    if (process.env.AGENT_SERVICE_URL) {
      const {planningData,recordBaseline}=await import('@/lib/planning/store')
      await recordBaseline(owner,await planningData(owner))
    }
    return { transactions, ready: ready && fresh && covered, updated }
  }
  throw new Error('Transaction history changed during sync. Refresh to retry.')
}
