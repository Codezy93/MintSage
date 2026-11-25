'use client'

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="container mx-auto space-y-4 p-6">
      <p role="alert">Transaction history could not be loaded.</p>
      <button onClick={reset} className="underline">Try again</button>
    </main>
  )
}
