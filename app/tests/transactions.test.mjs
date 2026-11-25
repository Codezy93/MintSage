import assert from 'node:assert/strict'
import test from 'node:test'
import { normalize } from '../src/lib/transactions/normalize.ts'
import { countsAsSpending } from '../src/types/transactions.ts'

function transaction(primary, amount, pending = false) {
  return normalize({
    account_id: 'account', transaction_id: 'posted', pending_transaction_id: 'pending',
    date: '2024-02-29', amount, iso_currency_code: 'CAD', pending,
    merchant_entity_id: 'merchant', merchant_name: 'Market',
    personal_finance_category: primary ? { primary, detailed: primary + '_DETAIL' } : null,
  })
}

test('posted purchases and refunds contribute signed amounts to spending', () => {
  const rows = [
    transaction('FOOD_AND_DRINK', 90), transaction('FOOD_AND_DRINK', -15),
    transaction('FOOD_AND_DRINK', 90, true), transaction('LOAN_PAYMENTS', 90),
    transaction('TRANSFER_OUT', 100), transaction('TRANSFER_IN', -100),
    transaction('INCOME', -200), transaction(null, 10),
  ]
  assert.equal(rows.filter(countsAsSpending).reduce((sum, row) => sum + row.amount, 0), 75)
  assert.deepEqual(rows.map(row => row.kind), [
    'purchase', 'refund', 'purchase', 'debt', 'transfer', 'transfer', 'income', 'review',
  ])
  assert.ok(rows[4].needsReview)
  assert.ok(rows[7].needsReview)
})

test('provider identifiers, currency, categories and date survive normalization', () => {
  assert.deepEqual(transaction('FOOD_AND_DRINK', 90), {
    id: 'posted', pendingId: 'pending', pending: false, accountId: 'account',
    date: '2024-02-29', amount: 90, currency: 'CAD', vendor: 'Market',
    merchantId: 'merchant', category: 'FOOD_AND_DRINK', detailedCategory: 'FOOD_AND_DRINK_DETAIL',
    kind: 'purchase', needsReview: false,
  })
})
