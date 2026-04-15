import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Housekeeping',
  description: 'Panel de limpieza',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
