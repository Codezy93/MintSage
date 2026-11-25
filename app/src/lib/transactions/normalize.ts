import type { Transaction } from 'plaid'
import type { TransactionRecord } from '@/types/transactions'

export function normalize(tx: Transaction): TransactionRecord {
  const category = tx.personal_finance_category?.primary ?? 'Uncategorized'
  let kind: TransactionRecord['kind']
  if (category.startsWith('TRANSFER')) kind = 'transfer'
  else if (category === 'LOAN_PAYMENTS') kind = 'debt'
  else if (category === 'INCOME' && tx.amount < 0) kind = 'income'
  else if (['INCOME', 'Uncategorized', 'OTHER'].includes(category)) kind = 'review'
  else kind = tx.amount < 0 ? 'refund' : 'purchase'
  return {
    id: tx.transaction_id, accountId: tx.account_id, date: tx.date,
    amount: tx.amount, currency: tx.iso_currency_code ?? tx.unofficial_currency_code ?? null,
    pending: tx.pending, pendingId: tx.pending_transaction_id ?? null,
    vendor: tx.merchant_name ?? tx.name, merchantId: tx.merchant_entity_id ?? null,
    category, detailedCategory: tx.personal_finance_category?.detailed ?? null,
    kind, needsReview: kind === 'review' || kind === 'transfer',
  }
}
