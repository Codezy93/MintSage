export type TransactionRecord = {
  id: string
  accountId: string
  date: string
  amount: number
  currency: string | null
  pending: boolean
  pendingId: string | null
  vendor: string
  merchantId: string | null
  category: string
  detailedCategory: string | null
  kind: 'purchase' | 'refund' | 'income' | 'transfer' | 'debt' | 'review'
  needsReview: boolean
}

export function countsAsSpending(tx: TransactionRecord) {
  return !tx.pending && (tx.kind === 'purchase' || tx.kind === 'refund')
}
