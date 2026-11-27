'use client'
import { useState, useEffect, type FormEvent } from 'react'
type Run = {
  id: string
  topic: string
  status: string
  trigger: string
  created_at: string
  result: {
    claims?: { label: string; text: string; evidence: string }[]
    message?: string
    fact_source?: string
    sources?: { id: string; sources: string[]; assumptions: string[] }[]
    proposal?: { category: string; limit: number }
  }
}
type View = {
  runs: Run[]
  memory: {
    id: string
    kind: string
    classification?: string
    decision?: string
    topic?: string
  }[]
  more: boolean
  policy: boolean
}
const button =
  'rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50'
const topics = {
  cash: 'Cash outlook',
  recurring: 'Recurring charges',
  anomaly: 'Unusual spending',
  reconciliation: 'Unclassified transactions',
  scenario: 'Purchase scenario',
  budget: 'Propose a budget',
}
export function Inbox() {
  const [view, setView] = useState<View>(),
    [error, setError] = useState(''),
    [offset, page] = useState(0),
    [version, refresh] = useState(0),
    [busy, setBusy] = useState(false),
    [topic, setTopic] = useState('cash')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const res = await fetch('/api/inbox?offset=' + offset, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await res.json()
        if (!res.ok) throw Error(body.error)
        if (!controller.signal.aborted) {
          setView(body)
          setError('')
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load inbox')
      }
    }
    void load()
    const timer = setInterval(load, 10000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [offset, version])
  async function send(payload: object) {
    setBusy(true)
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw Error((await res.json()).error)
      refresh((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }
  function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amount = Number(new FormData(e.currentTarget).get('purchase'))
    void send({
      action: 'start',
      id: crypto.randomUUID(),
      topic,
      ...(topic === 'scenario' ? { scenario: { purchase: amount } } : {}),
    })
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={start}>
        <label>
          Review{' '}
          <select
            className={button}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {Object.entries(topics).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {topic === 'scenario' && (
          <label>
            Purchase (USD){' '}
            <input
              className={button}
              name="purchase"
              type="number"
              min=".01"
              step=".01"
              required
            />
          </label>
        )}
        <button className={button} disabled={busy || !view}>
          Start review
        </button>
      </form>
      {view ? (
        <>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={view.policy}
              disabled={busy}
              onChange={(e) =>
                send({ action: 'policy', enabled: e.target.checked })
              }
            />
            Automatically dismiss similar duplicate alerts after three
            dismissals
          </label>
          {view.runs.length === 0 && <p>No findings on this page.</p>}
          {view.runs.map((r) => (
            <article className="space-y-2 rounded-xl border p-4" key={r.id}>
              <h2 className="font-semibold">
                {topics[r.topic as keyof typeof topics]} · {r.status}
              </h2>
              <p className="text-sm">
                {new Date(r.created_at).toLocaleString()} · {r.trigger}
              </p>
              {r.result.claims?.map((c, i) => (
                <p key={i}>
                  <strong>{c.label}</strong> · {c.text}
                </p>
              ))}
              {r.result.message && <p>{r.result.message}</p>}
              {r.result.sources?.length ? (
                <details>
                  <summary>Supporting records and assumptions</summary>
                  {r.result.sources.map((s) => (
                    <p key={s.id}>
                      {s.assumptions.join(' ')} Records:{' '}
                      {s.sources.join(', ') || 'none'}
                    </p>
                  ))}
                </details>
              ) : null}
              {r.status === 'awaiting' && r.result.proposal && (
                <p>
                  Approve a monthly {r.result.proposal.category} budget of USD{' '}
                  {r.result.proposal.limit.toFixed(2)}?
                </p>
              )}
              <div className="flex gap-2">
                {(r.status === 'awaiting'
                  ? ['approve', 'decline']
                  : r.status === 'open'
                    ? ['confirm', 'dismiss']
                    : r.status === 'automatic'
                      ? ['reverse']
                      : []
                ).map((action) => (
                  <button
                    className={button}
                    key={action}
                    disabled={busy}
                    onClick={() => send({ action, id: r.id })}
                  >
                    {action === 'reverse' ? 'Undo automatic dismissal' : action}
                  </button>
                ))}
                {r.result.fact_source &&
                  ['open', 'confirmed'].includes(r.status) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => send({ action: 'rent_split', id: r.id })}
                    >
                      Remember as rent split
                    </button>
                  )}
              </div>
            </article>
          ))}
          <section>
            <h2 className="text-xl font-semibold">Saved memory</h2>
            {!view.memory.length && (
              <p>No saved facts or decisions on this page.</p>
            )}
            {view.memory.map((m) => (
              <p key={m.kind + m.id}>
                {m.classification ?? m.topic} · {m.decision ?? 'confirmed fact'}{' '}
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    send({ action: 'forget', kind: m.kind, id: m.id })
                  }
                >
                  Forget
                </button>
              </p>
            ))}
          </section>
          <div className="flex gap-2">
            {offset > 0 && (
              <button className={button} onClick={() => page(offset - 50)}>
                Previous
              </button>
            )}
            {view.more && (
              <button className={button} onClick={() => page(offset + 50)}>
                Next
              </button>
            )}
          </div>
        </>
      ) : (
        !error && <p>Loading inbox…</p>
      )}
    </>
  )
}
