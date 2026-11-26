'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sparkles, Building2, CreditCard, Shield, CheckCircle2, Loader2 } from 'lucide-react'
import {
  usePlaidLink,
  PlaidLinkOnSuccess,
  PlaidLinkOptions,
  PlaidLinkOnExit,
} from 'react-plaid-link'

export default function PlaidConnectPage() {
  const router = useRouter()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [shouldOpenLink, setShouldOpenLink] = useState(false)

  const fetchLinkToken = useCallback(async () => {
    const response = await fetch('/api/plaid/create-link-token', {
      method: 'POST',
    })

    const payload = (await response.json().catch(() => ({}))) as {
      link_token?: string
      error?: string
    }

    if (!response.ok || !payload.link_token) {
      throw new Error(payload.error ?? 'Failed to create Plaid link token')
    }

    setLinkToken(payload.link_token)
    return payload.link_token
  }, [])

  const handlePlaidSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      try {
        const response = await fetch('/api/plaid/exchange-public-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_token: publicToken }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          connected?: boolean
          error?: string
        }

        if (!response.ok || payload.connected !== true) {
          throw new Error(payload.error ?? 'Failed to exchange Plaid token')
        }

        setIsConnected(true)
        setIsConnecting(false)
        setShouldOpenLink(false)

        setTimeout(() => {
          router.push('/dashboard')
          router.refresh()
        }, 1500)
      } catch (err: unknown) {
        setLinkToken(null)
        setError(err instanceof Error ? err.message : 'Failed to complete Plaid connection')
        setIsConnecting(false)
        setShouldOpenLink(false)
      }
    },
    [router],
  )

  const handlePlaidExit = useCallback<PlaidLinkOnExit>((plaidError) => {
    if (plaidError) {
      setError(
        plaidError.display_message ??
          plaidError.error_message ??
          'Plaid connection was cancelled',
      )
    }
    setIsConnecting(false)
    setShouldOpenLink(false)
  }, [])

  // ✅ Always pass a config object, even when token is null
  const plaidOptions: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handlePlaidSuccess,
    onExit: handlePlaidExit,
  }

  const { open, ready, error: plaidLinkError } = usePlaidLink(plaidOptions)

  const linkErrorMessage = error ?? plaidLinkError?.message
  const connecting = isConnecting && !plaidLinkError

  useEffect(() => {
    if (plaidLinkError || !shouldOpenLink || !ready || !linkToken) return
    open()
  }, [linkToken, open, plaidLinkError, ready, shouldOpenLink])

  const handleConnect = useCallback(
    async () => {
      if (plaidLinkError) {
        window.location.reload()
        return
      }
      setIsConnecting(true)
      setError(null)

      try {
        if (!linkToken) {
          await fetchLinkToken()
        }

        setShouldOpenLink(true)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        setIsConnecting(false)
        setShouldOpenLink(false)
      }
    },
    [fetchLinkToken, linkToken, plaidLinkError],
  )

  return (
    <div className="min-h-screen bg-linear-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950 dark:via-teal-950 dark:to-cyan-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="size-10 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Sparkles className="size-6 text-white" />
          </div>
          <span className="text-2xl font-bold bg-linear-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            MintSage
          </span>
        </Link>

        {/* Connection Card */}
        <div className="bg-white/80 dark:bg-background/80 backdrop-blur-xl rounded-2xl border border-emerald-200/50 dark:border-emerald-800/50 shadow-xl shadow-emerald-500/10 p-8">
          {!isConnected ? (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 mb-4">
                  <Building2 className="size-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Connect your bank account</h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Link your bank account through Plaid to start tracking your spending and get
                  personalized insights
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-4 mb-8">
                <Card className="p-4 bg-white dark:bg-background border-emerald-200/50 dark:border-emerald-800/50">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <CreditCard className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Automatic Transaction Tracking</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        MintSage imports available transactions and their Plaid categories.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-white dark:bg-background border-teal-200/50 dark:border-teal-800/50">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                      <Sparkles className="size-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">What Gemini receives</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        When dashboard insights load and when you ask a question, the dashboard assistant sends Gemini the question, income and spending totals, category statistics, trends, and an experimental forecast summary.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-white dark:bg-background border-cyan-200/50 dark:border-cyan-800/50">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center shrink-0">
                      <Shield className="size-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">How forecasts work</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        The forecast service receives dates and daily USD spending totals for the last 60 days to estimate the next 30. Forecast accuracy has yet to be validated.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {linkErrorMessage && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{linkErrorMessage}</p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3">
                <Button
                  onClick={handleConnect}
                  className="w-full bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30"
                  disabled={connecting}
                  size="lg"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Building2 className="size-4 mr-2" />
                      Connect Bank Account
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground mt-6">
                You can also <Link className="underline" href="/planning">plan with manual balances</Link>. MintSage can explain activity and suggest actions. It cannot move money or change external accounts.
              </p>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center size-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-6 animate-fade-in-up">
                <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Successfully connected!</h2>
              <p className="text-muted-foreground">Redirecting you to your dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
