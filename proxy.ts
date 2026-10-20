import { NextResponse, type NextRequest } from "next/server";

// Rate limits for the API routes, per visitor IP (mobile carriers share IPs, so limits leave room). Routes that send emails or SMS (they cost money and
// can be used to spam people) and code checks (guessing) are tight; the rest are generous so normal
// staff work never hits them. Counters live in the database (rate_limit_hit), so every server agrees.
// If the counter cannot be reached quickly, the request goes through: a limiter must never take the
// site down.
const RULES: { prefix: string; max: number; windowSeconds: number }[] = [
  { prefix: "/api/auth/signup", max: 10, windowSeconds: 600 },
  { prefix: "/api/auth/resend-signup", max: 10, windowSeconds: 600 },
  { prefix: "/api/auth/forgot-password", max: 10, windowSeconds: 600 },
  { prefix: "/api/security/send-code", max: 10, windowSeconds: 600 },
  { prefix: "/api/sms/send", max: 20, windowSeconds: 600 },
  { prefix: "/api/sms/job-accepted", max: 30, windowSeconds: 600 },
  { prefix: "/api/auth/verify-signup", max: 20, windowSeconds: 600 },
  { prefix: "/api/auth/reset-password", max: 20, windowSeconds: 600 },
  { prefix: "/api/security/verify-code", max: 20, windowSeconds: 600 },
  { prefix: "/api/security/secondary", max: 20, windowSeconds: 600 },
  { prefix: "/api/auth", max: 30, windowSeconds: 600 },
  { prefix: "/api/admin/invite-user", max: 30, windowSeconds: 600 },
  { prefix: "/api/geocode", max: 60, windowSeconds: 60 },
  { prefix: "/api", max: 300, windowSeconds: 60 },
];

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rule = RULES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  if (!rule || request.method === "OPTIONS" || !url || !key) return NextResponse.next();

  try {
    const res = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_bucket: `${rule.prefix}|${clientIp(request)}`,
        p_max: rule.max,
        p_window_seconds: rule.windowSeconds,
      }),
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return NextResponse.next();
    const result = (await res.json()) as { allowed?: boolean; retry_after?: number };
    if (result.allowed === false) {
      const wait = Math.max(1, Number(result.retry_after) || rule.windowSeconds);
      return NextResponse.json(
        { error: `Too many requests. Please wait ${wait < 60 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`} and try again.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
  } catch {
    // Counter unreachable or slow: let the request through.
  }
  return NextResponse.next();
}

export const config = {
  // The daily cron is called by Vercel with its own secret; never limit it.
  matcher: ["/api/((?!cron/).*)"],
};
