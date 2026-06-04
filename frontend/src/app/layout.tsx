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
  display: "swap",
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.valoreparfums.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Valore Parfums | Perfume Decants & Samples in Bangladesh",
    template: "%s | Valore Parfums",
  },
  description: "Buy authentic perfume decants & samples in Bangladesh. Try luxury fragrances in 3ml, 5ml, 10ml, 15ml & 30ml before committing to a full bottle. Fast delivery in Dhaka.",
  keywords: ["perfume decant bangladesh", "buy perfume samples bangladesh", "fragrance decant dhaka", "luxury perfume samples", "try before you buy perfume"],
  authors: [{ name: "Valore Parfums" }],
  robots: { index: true, follow: true },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Valore Parfums",
    title: "Valore Parfums | Perfume Decants & Samples in Bangladesh",
    description: "Buy authentic perfume decants & samples in Bangladesh. Try luxury fragrances in 3ml, 5ml, 10ml, 15ml & 30ml before committing to a full bottle.",
    url: SITE_URL,
    images: [{ url: "/valore-logo.png", width: 512, height: 512, alt: "Valore Parfums" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Valore Parfums | Perfume Decants & Samples in Bangladesh",
    description: "Buy authentic perfume decants & samples in Bangladesh. Try luxury fragrances before committing to a full bottle.",
    images: ["/valore-logo.png"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Valore Parfums",
              url: SITE_URL,
              logo: `${SITE_URL}/valore-logo.png`,
              description: "Premium perfume decants and fragrance samples in Bangladesh.",
              address: {
                "@type": "PostalAddress",
                addressCountry: "BD",
                addressLocality: "Dhaka",
              },
              sameAs: [
                "https://www.facebook.com/ValoreParfums",
                "https://www.instagram.com/valore_parfums/",
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["LocalBusiness", "Store"],
              name: "Valore Parfums",
              url: SITE_URL,
              logo: `${SITE_URL}/valore-logo.png`,
              image: `${SITE_URL}/valore-logo.png`,
              description: "Authentic perfume decants and full bottle requests in Bangladesh. Fast delivery in Dhaka.",
              priceRange: "৳৳",
              areaServed: "Bangladesh",
              address: {
                "@type": "PostalAddress",
                addressCountry: "BD",
                addressLocality: "Dhaka",
                addressRegion: "Dhaka Division",
              },
              sameAs: [
                "https://www.facebook.com/ValoreParfums",
                "https://www.instagram.com/valore_parfums/",
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              url: SITE_URL,
              name: "Valore Parfums",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${SITE_URL}/shop?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <ThemeInitializer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
