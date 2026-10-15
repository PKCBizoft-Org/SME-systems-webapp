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
  title: {
    default: "PKC BIZOFT",
    template: "%s | PKC BIZOFT",
  },
  description: "PKC BIZOFT Client and Billing Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        {/* Marks phones and weaker devices (touch screens under 900px, little memory, few cores, data saver) so heavy effects are skipped. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var n=navigator,c=n.connection||{};if(localStorage.getItem('pkc_lite_v1')||(n.deviceMemory&&n.deviceMemory<=6)||(n.hardwareConcurrency&&n.hardwareConcurrency<=6)||c.saveData||(matchMedia('(pointer:coarse)').matches&&matchMedia('(max-width:900px)').matches)){document.documentElement.classList.add('lite')}}catch(e){}})();",
          }}
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
