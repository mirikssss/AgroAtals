import React from "react"
import type { Metadata, Viewport } from 'next'
import { Wix_Madefor_Display, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { LayoutScaleProvider } from '@/components/layout-scale-provider'
import './globals.css'

const wixMadeforDisplay = Wix_Madefor_Display({ subsets: ["latin", "cyrillic"], variable: "--font-wix-madefor-display" })
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#5a8c4f',
}

export const metadata: Metadata = {
  title: 'AgroRisk | Agricultural Risk Intelligence Platform',
  description: 'Field-level agricultural risk insights for banks, insurers, and agri-finance professionals. Analyze crop risks with satellite data and AI-powered recommendations.',
  generator: 'v0.app',
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
    <html lang="en" className={wixMadeforDisplay.variable}>
      <body className="font-sans antialiased appShell">
        <LayoutScaleProvider>
          {children}
        </LayoutScaleProvider>
        <Analytics />
      </body>
    </html>
  )
}
