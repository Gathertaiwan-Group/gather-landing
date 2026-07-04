import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "給樂數位 Gather — AI 賦能的客製化數位系統",
  description:
    "給樂數位｜客製化網站建置、AI 賦能的 CRM 系統、金、物流與電子發票串接。高端客製、量身打造。",
  metadataBase: new URL("https://gathertaiwan.com"),
  openGraph: {
    title: "給樂數位 Gather — AI 賦能的客製化數位系統",
    description:
      "給樂數位｜客製化網站建置、AI 賦能的 CRM 系統、金、物流與電子發票串接。",
    type: "website",
    locale: "zh_TW",
    siteName: "給樂數位 Gather",
    url: "https://gathertaiwan.com",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "給樂數位 Gather — 為每個品牌，打造專屬數位資產",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "給樂數位 Gather — AI 賦能的客製化數位系統",
    description:
      "給樂數位｜客製化網站建置、AI 賦能的 CRM 系統、金、物流與電子發票串接。",
    images: ["/og.jpg"],
  },
  verification: {
    google: "Szp_uaVcBcZf9GLF4pVWpiRlujeURWwBOrGsYAVQWXY",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700;900&family=Space+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
