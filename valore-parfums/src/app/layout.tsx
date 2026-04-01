import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";
import { ThemeInitializer } from "@/components/ThemeInitializer";

const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "Valore Parfums",
  description: "Premium perfume decants – curated luxury in every drop",
  icons: {
    icon: "/valore-logo.png",
    apple: "/valore-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${serif.variable} ${sans.variable} ${mono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeInitializer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
