import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'MintSage - AI-Powered Personal Finance',
  description: 'Track, save, and optimize your finances with AI-powered insights and forecasting',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}

