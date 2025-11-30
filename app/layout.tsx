// app/layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Philosopher } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

const philosopher = Philosopher({
  subsets: ["latin"],
  weight: ["400", "700"], // regular + bold
})

export const metadata: Metadata = {
  title: "Legacy Night: Beyond the Silver Lining",
  description: "Event Management System",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-32x32.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${philosopher.className} antialiased bg-background text-foreground`}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
