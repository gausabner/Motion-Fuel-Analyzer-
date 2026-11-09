import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Motion Fuel Analyzer - Premium Fleet Management",
  description: "Advanced fuel management and analytics system for fleet operations",
};

import { Providers } from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable belongs on <html>, not <body>. Tailwind resolves
    // --font-sans on :root, so a --font-outfit declared one level down on
    // <body> is out of scope there — the variable fell through and every
    // screen in the app rendered in the system sans fallback instead of
    // Outfit, with the webfont registered but never requested.
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
