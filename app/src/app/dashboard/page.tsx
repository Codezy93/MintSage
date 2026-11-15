// app/dashboard/page.tsx
import { DashboardHeader } from '@/components/dashboard/header'
import getTransactions from '@/lib/transactions/transactions'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardPage() {
  const { transactions } = await getTransactions()

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950 dark:via-teal-950 dark:to-cyan-950">
      <DashboardHeader />

      <main className="container mx-auto px-6 py-8 space-y-8">
        <DashboardShell initialTransactions={transactions} />
      </main>
    </div>
  )
}
