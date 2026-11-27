import { redirect } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { Inbox } from './inbox'

export default async function Page() {
  if (!(await verifiedUser())) redirect('/login')
  return (
    <>
      <DashboardHeader />
      <main className="mx-auto max-w-3xl space-y-6 p-5">
        <h1 className="text-3xl font-bold">Agent inbox</h1>
        <Inbox />
      </main>
    </>
  )
}
