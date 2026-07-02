import './globals.css'
import type { Metadata } from 'next'
import { Cormorant_Garamond, Source_Serif_4 } from 'next/font/google'
import type { ReactNode } from 'react'

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700']
})

const bodyFont = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700']
})

export const metadata: Metadata = {
  title: 'DamnMail',
  description: 'Multi-domain temporary mail dashboard'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="font-body text-ink">{children}</body>
    </html>
  )
}
