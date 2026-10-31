import { NextResponse } from "next/server";
import { adminClient } from "@/lib/serverSecurity";

// The live ISP whose numbers the public home page shows (the other tenant is a test ISP).
const PKC_TENANT_ID = "4eefc34f-5475-4c54-886b-9d833ef3997a";

export type HomeStats = {
  homes: number;
  ratingCount: number;
  avgStars: number | null;
  reviews: { stars: number; comment: string }[];
};

const EMPTY: HomeStats = { homes: 0, ratingCount: 0, avgStars: null, reviews: [] };

// Public numbers for the home page: counts and anonymous reviews only, never names or contact details.
// Reviews must be 4 or 5 stars and already checked by staff (reviewed_at set) before they can show.
// The CDN keeps the answer for an hour, so visitors never hit the database directly.
export async function GET() {
  const admin = adminClient();
  if (!admin) return NextResponse.json(EMPTY);

  const [homes, stars, reviews] = await Promise.all([
    admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", PKC_TENANT_ID)
      .eq("installation_status", "Installed"),
    admin.from("ratings").select("stars").eq("tenant_id", PKC_TENANT_ID),
    admin
      .from("ratings")
      .select("stars, comment")
      .eq("tenant_id", PKC_TENANT_ID)
      .gte("stars", 4)
      .not("reviewed_at", "is", null)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const starList = ((stars.data ?? []) as { stars: number }[]).map((r) => r.stars).filter((n) => n > 0);
  const body: HomeStats = {
    homes: homes.count ?? 0,
    ratingCount: starList.length,
    avgStars: starList.length ? Math.round((starList.reduce((a, b) => a + b, 0) / starList.length) * 10) / 10 : null,
    reviews: ((reviews.data ?? []) as { stars: number; comment: string }[])
      .map((r) => ({ stars: r.stars, comment: r.comment.trim() }))
      .filter((r) => r.comment.length >= 15)
      .slice(0, 6),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
