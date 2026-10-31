import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { FutureFX } from "./components/FutureFX";
import { CookieNotice } from "./components/CookieNotice";
import { LagWatch } from "./components/LagWatch";
import { LiteToggle } from "./components/LiteToggle";
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
    default: "PKC BIZOFT | Business Systems Solutions",
    template: "%s | PKC BIZOFT",
  },
  description:
    "PKC BIZOFT (bizoftph) home WiFi in Mabini and Pantukan, Davao de Oro. Up to 200 Mbps from ₱750/month. Apply, pay bills and track your technician in one app.",
  keywords: ["Business Systems Solutions", "PKC BIZOFT", "PKC Bizoft", "bizoft", "bizoftph", "phbizoft", "Bizoft PH", "WiFi installation", "internet service", "Philippines"],
  openGraph: {
    type: "website",
    siteName: "PKC BIZOFT",
    title: "PKC BIZOFT | Business Systems Solutions",
    description: "Home WiFi installation, bills, repairs and technician tracking in one app.",
    images: ["/pkc-logo.webp"],
  },
};

// Tells Google and Bing who we are, so searches for our name show our site and logo.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PKC BIZOFT",
  alternateName: ["Business Systems Solutions", "PKC Bizoft", "Bizoft", "bizoftph", "bizoftph.com", "phbizoft", "Bizoft PH", "PH Bizoft"],
  sameAs: ["https://www.facebook.com/PKCGrpofCmpny"],
  url: "https://bizoftph.com",
  logo: "https://bizoftph.com/pkc-logo.webp",
  description: "Home WiFi installation and internet service in Mabini and Bongabong (Pantukan), Davao de Oro, Philippines.",
  areaServed: [
    { "@type": "AdministrativeArea", name: "Mabini, Davao de Oro, Philippines" },
    { "@type": "Place", name: "Bongabong, Pantukan, Davao de Oro, Philippines" },
  ],
  // Founder first, then co-founders; the Who We Are page says who is which.
  founder: [
    { "@type": "Person", name: "Paul Kent Cairel", jobTitle: "Founder", url: "https://bizoftph.com/who-we-are" },
    {
      "@type": "Person",
      "@id": "https://prince-aj-cuyos.princeajycuyos28.workers.dev/#me",
      name: "Prince AJ Y. Cuyos",
      jobTitle: "Co-Founder",
      url: "https://prince-aj-cuyos.princeajycuyos28.workers.dev/",
      sameAs: [
        "https://bizoftph.com/who-we-are",
        "https://www.facebook.com/Underrated.Prince.AJ",
        "https://www.instagram.com/prinx_cys",
        "https://github.com/PRiNXCYS",
      ],
    },
  ],
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
              "(function(){try{var n=navigator,c=n.connection||{};var t=+localStorage.getItem('pkc_lite_v2')||0;if(!localStorage.getItem('pkc_lite_off')&&(Date.now()-t<6048e5||(n.deviceMemory&&n.deviceMemory<=2)||c.saveData)){document.documentElement.classList.add('lite')}var h=document.documentElement;if(sessionStorage.getItem('pkc_intro_seen'))h.classList.add('homeIntroSeen');if(sessionStorage.getItem('pkc_who_intro_seen'))h.classList.add('whoIntroSeen')}catch(e){}})();",
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
        <LiteToggle />
      </body>
    </html>
  );
}
