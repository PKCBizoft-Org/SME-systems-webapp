import { NextRequest, NextResponse } from "next/server";
import { logUserAudit, requireTenantAdmin } from "@/lib/userAdmin";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Admins can correct a staff member's mobile number and address.
// (Name, hire date and employee number are intentionally not editable here.)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const tenantId = str(body.tenantId);
    const userId = str(body.userId);

    const ctx = await requireTenantAdmin(request, tenantId);
    if (ctx instanceof NextResponse) return ctx;
    const { admin } = ctx;

    if (!userId) return bad("Choose a user.");

    const { data: membership } = await admin
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!membership) return bad("That user does not belong to this tenant.", 404);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const changed: string[] = [];

    if (body.mobileNumber !== undefined) {
      const mobile = str(body.mobileNumber).replace(/[\s-]/g, "");
      if (!/^(\+63|0)9\d{9}$/.test(mobile)) {
        return bad("Enter a valid Philippine mobile number, like 09123456789.");
      }
      update.mobile_number = mobile.startsWith("+63") ? `0${mobile.slice(3)}` : mobile;
      changed.push("mobile");
    }

    if (body.address !== undefined) {
      const a = (body.address || {}) as Record<string, unknown>;
      const regionCode = str(a.regionCode);
      const cityCode = str(a.cityCode);
      const barangayCode = str(a.barangayCode);
      const purok = str(a.purok);
      if (!regionCode || !cityCode || !barangayCode || !purok) {
        return bad("Choose the region, city / municipality and barangay, and enter the Purok.");
      }
      update.region_code = regionCode;
      update.province_code = str(a.provinceCode) || null;
      update.city_municipality_code = cityCode;
      update.barangay_code = barangayCode;
      update.purok = purok;
      changed.push("address");
    }

    if (changed.length === 0) return bad("Nothing to update.");

    const { error } = await admin.from("user_profiles").update(update).eq("user_id", userId);
    if (error) return bad(`Unable to save: ${error.message}`, 500);

    const { data: target } = await admin.auth.admin.getUserById(userId);
    await logUserAudit(ctx, {
      targetUserId: userId,
      targetEmail: target.user?.email ?? null,
      action: "profile_updated",
      detail: changed.join(" + "),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Staff profile route error:", error);
    return bad("An unexpected error occurred.", 500);
  }
}
