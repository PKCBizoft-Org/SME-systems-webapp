import type { Metadata } from "next";

// The page itself is a client component, so its search title and description live here.
export const metadata: Metadata = {
  title: { absolute: "Founders of PKC BIZOFT (bizoftph) | Paul Kent Cairel & Team" },
  description:
    "Who founded PKC BIZOFT (bizoftph.com)? Founder Paul Kent Cairel and co-founder Prince AJ Y. Cuyos, the team behind the business systems, the customer app and the home internet service.",
  alternates: { canonical: "/who-we-are" },
  openGraph: {
    title: "PKC BIZOFT Founders & Team",
    description: "Founder Paul Kent Cairel and co-founder Prince AJ Y. Cuyos, the team behind PKC BIZOFT business systems.",
    url: "/who-we-are",
  },
};

export default function WhoWeAreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
