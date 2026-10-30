import type { Metadata } from "next";

// The page itself is a client component, so its search title and description live here.
export const metadata: Metadata = {
  title: "Founders & Team",
  description:
    "Meet the people behind PKC BIZOFT: founder Paul Kent Cairel and co-founder Prince AJ Y. Cuyos.",
  alternates: { canonical: "/who-we-are" },
  openGraph: {
    title: "PKC BIZOFT Founders & Team",
    description: "Founder Paul Kent Cairel and co-founder Prince AJ Y. Cuyos.",
    url: "/who-we-are",
  },
};

export default function WhoWeAreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
