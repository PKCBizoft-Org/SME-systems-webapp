import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { FutureFX } from "./components/FutureFX";
import { CookieNotice } from "./components/CookieNotice";
import { LagWatch } from "./components/LagWatch";
import StyledJsxRegistry from "./registry";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headings; Geist stays the body face.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#02080c",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bizoftph.com"),
  title: {
    default: "Business Systems Solutions | PKC BIZOFT",
    template: "%s | PKC BIZOFT",
  },
  description:
    "PKC BIZOFT (bizoftph) Business Systems Solutions: home WiFi and internet installation. Request an installation, pay your bills, track your technician and get help, all in one app.",
  keywords: ["Business Systems Solutions", "PKC BIZOFT", "PKC Bizoft", "bizoft", "bizoftph", "WiFi installation", "internet service", "Philippines"],
  openGraph: {
    type: "website",
    siteName: "PKC BIZOFT",
    title: "Business Systems Solutions | PKC BIZOFT",
    description: "Home WiFi installation, bills, repairs and technician tracking in one app.",
    images: ["/pkc-logo.webp"],
  },
};

// Tells Google and Bing who we are, so searches for our name show our site and logo.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PKC BIZOFT",
  alternateName: ["Business Systems Solutions", "PKC Bizoft", "Bizoft", "bizoftph", "bizoftph.com"],
  url: "https://bizoftph.com",
  logo: "https://bizoftph.com/pkc-logo.webp",
  description: "Home WiFi installation and internet service in the Philippines.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        {/* Marks weaker devices (4 GB of memory or less, data saver, or lag saved by LagWatch) so heavy effects are skipped. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var n=navigator,c=n.connection||{};if(localStorage.getItem('pkc_lite_v1')||(n.deviceMemory&&n.deviceMemory<=4)||c.saveData){document.documentElement.classList.add('lite')}}catch(e){}})();",
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <StyledJsxRegistry>{children}</StyledJsxRegistry>
        <FutureFX />
        <CookieNotice />
        <LagWatch />
      </body>
    </html>
  );
}
