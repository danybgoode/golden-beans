import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const sans = Archivo({ subsets: ['latin'], variable: '--font-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata = {
  title: 'Golden Beans — the growth engine your agent operates',
  description: 'Telemetry ingest, TARS funnels, North Star metrics, and A/B experiments — as primitives your agent can operate over MCP.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
