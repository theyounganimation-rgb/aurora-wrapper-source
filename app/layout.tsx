import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Aurora Wrapper",
  description: "Aurora runtime shell",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Aurora",
    statusBarStyle: "default"
  }
}

export const viewport: Viewport = {
  themeColor: "#eef3fa",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
