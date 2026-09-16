import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Signal — BOT Chain operations', description: 'Collected, timestamped BOT Chain testnet observations and verifiable contract evidence.', icons: { icon: '/signal-mark.svg' } }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html> }
