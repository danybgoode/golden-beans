export const metadata = {
  title: 'Golden Beans — Growth Engine',
  description: 'Telemetry ingest, TARS funnels, North Star, and A/B bucketing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
