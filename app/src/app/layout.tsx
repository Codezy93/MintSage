import type { Metadata } from 'next'

import './globals.css'

import { Space_Mono as V0_Font_Space_Mono } from 'next/font/google'

// Initialize fonts
const _spaceMono = V0_Font_Space_Mono({ subsets: ['latin'], weight: ["400","700"] })

export const metadata: Metadata = {
  title: 'MintSage - AI-Powered Personal Finance',
  description: 'Track, save, and optimize your finances with AI-powered insights and forecasting',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${_spaceMono} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}

