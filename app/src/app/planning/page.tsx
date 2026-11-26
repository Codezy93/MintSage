import { redirect } from 'next/navigation'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { DashboardHeader } from '@/components/dashboard/header'
import { Planner } from './planner'

export default async function PlanningPage() {
  if (!(await verifiedUser())) redirect('/login')
  return (
    <>
      <DashboardHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <h1 className="text-3xl font-bold">Financial plan</h1>
        <Planner />
      </main>
    </>
  )
}
