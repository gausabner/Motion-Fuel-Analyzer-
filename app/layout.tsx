import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Instrument Sans carries the interface; IBM Plex Mono is for anything read
// off a pump slip — unit numbers, vote codes, timestamps, table figures.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Motion Fuel Analyzer",
  description: "See where the fuel went, and what to do about it.",
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
    <html lang="en" className={`${instrument.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased text-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
