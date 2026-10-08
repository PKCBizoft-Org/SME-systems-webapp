import { NextRequest, NextResponse } from "next/server";
import { smtpConfigured } from "@/lib/mailer";
import {
  TEMP_PASSWORD_HOURS,
  canonicalEmail,
  generateTempPassword,
  logUserAudit,
  requireTenantAdmin,
  roleLabel,
  sendAdminNotice,
  sendWelcomeEmail,
  tempPasswordMetadata,
} from "@/lib/userAdmin";

type TenantRole = "admin" | "technician" | "customer" | "accounting" | "inventory";

const ALLOWED_ROLES: TenantRole[] = [
  "admin",
  "technician",
  "customer",
  "accounting",
  "inventory",
];

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Adds a user to the tenant. New people get an account with a generated
// temporary password that is emailed from our own mailbox (not Supabase's).
// They must choose their own password at first sign-in, and the temporary one
// expires after TEMP_PASSWORD_HOURS.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

    const email = str(body.email).toLowerCase();
    const role = str(body.role);
    const tenantId = str(body.tenantId);
    const fullName = str(body.fullName);
    const mobileNumber = str(body.mobileNumber).replace(/[\s-]/g, "");
    const birthday = str(body.birthday);
    const gender = str(body.gender);
    const regionCode = str(body.regionCode);
    const provinceCode = str(body.provinceCode);
    const cityCode = str(body.cityCode);
    const barangayCode = str(body.barangayCode);
    const purok = str(body.purok);

    const ctx = await requireTenantAdmin(request, tenantId);
    if (ctx instanceof NextResponse) return ctx;
    const { admin } = ctx;

    if (fullName.length < 3 || !fullName.includes(" ")) {
      return bad("Enter the user's full name (first and last name).");
    }
    if (!/^(\+63|0)9\d{9}$/.test(mobileNumber)) {
      return bad("Enter a valid Philippine mobile number, like 09123456789.");
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
      Number.isNaN(Date.parse(birthday)) ||
      new Date(birthday) > new Date()
    ) {
      return bad("Enter a valid birthday.");
    }
    if (!["Male", "Female", "Other"].includes(gender)) {
      return bad("Choose the user's gender.");
    }
    if (!regionCode || !cityCode || !barangayCode || !purok) {
      return bad("Choose the user's region, city / municipality and barangay, and enter the Purok.");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return bad("A valid email address is required.");
    }
    if (!ALLOWED_ROLES.includes(role as TenantRole)) {
      return bad("Role must be admin, technician, accounting, inventory, or customer.");
    }

    // ---- existing account / look-alike check -------------------------------
    const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listError) return bad("Unable to check for existing accounts.", 502);

    const canonical = canonicalEmail(email);
    const existing = usersPage.users.find((u) => u.email?.toLowerCase() === email);
    const lookAlike = usersPage.users.find(
      (u) => u.email && u.email.toLowerCase() !== email && canonicalEmail(u.email) === canonical,
    );

    if (!existing && lookAlike) {
      return bad(
        `This email looks the same as an existing account (${lookAlike.email}). Use that exact address, or ask the person which one they use.`,
        409,
      );
    }

    // ---- account -----------------------------------------------------------
    let userId: string;
    let tempPassword: string | null = null;

    if (existing) {
      // Already has an account (another tenant or an earlier invite): just
      // grant access here; their password is untouched.
      userId = existing.id;
    } else {
      tempPassword = generateTempPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        app_metadata: tempPasswordMetadata(),
        user_metadata: {
          full_name: fullName,
          invited_by_email: ctx.actorEmail,
          invited_by_id: ctx.actorId,
        },
      });
      if (createError || !created.user) {
        return bad(`Unable to create this user: ${createError?.message || "unknown error"}`, 502);
      }
      userId = created.user.id;
    }

    // ---- profile rows ------------------------------------------------------
    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileLookupError) {
      return bad(`Unable to check the user's profile: ${profileLookupError.message}`, 500);
    }

    // The app-wide role is only set when the profile is first created; an
    // existing user's other-tenant access must not be overwritten here.
    const { error: profileError } = existingProfile
      ? await admin.from("profiles").update({ email }).eq("id", userId)
      : await admin.from("profiles").insert({ id: userId, email, role });
    if (profileError) {
      return bad(`Unable to save the user's profile: ${profileError.message}`, 500);
    }

    const { error: detailsError } = await admin.from("user_profiles").upsert({
      user_id: userId,
      full_name: fullName,
      mobile_number: mobileNumber,
      birthday,
      gender,
      purok,
      region_code: regionCode,
      province_code: provinceCode || null,
      city_municipality_code: cityCode,
      barangay_code: barangayCode,
      approval_status: "approved",
      updated_at: new Date().toISOString(),
    });
    if (detailsError) {
      return bad(`Unable to save the user's details: ${detailsError.message}`, 500);
    }

    const { data: membership } = await admin
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let previousRole: string | null = null;
    if (membership) {
      previousRole = membership.role as string;
      const { error: updateError } = await admin
        .from("tenant_users")
        .update({ role })
        .eq("user_id", userId)
        .eq("tenant_id", tenantId);
      if (updateError) return bad(`Unable to update tenant access: ${updateError.message}`, 500);
    } else {
      const { error: insertError } = await admin
        .from("tenant_users")
        .insert({ user_id: userId, tenant_id: tenantId, role });
      if (insertError) return bad(`Unable to grant tenant access: ${insertError.message}`, 500);
    }

    // ---- email, audit, notice ---------------------------------------------
    let emailSent = false;
    if (tempPassword && smtpConfigured()) {
      try {
        await sendWelcomeEmail(email, {
          name: fullName,
          role,
          password: tempPassword,
          loginUrl: new URL("/login", request.nextUrl.origin).toString(),
          hours: TEMP_PASSWORD_HOURS,
        });
        emailSent = true;
      } catch (error) {
        console.error("Welcome email failed:", error);
      }
    }

    const roleChanged = previousRole !== null && previousRole !== role;
    await logUserAudit(ctx, {
      targetUserId: userId,
      targetEmail: email,
      action: roleChanged ? "role_changed" : existing ? "access_granted" : "user_added",
      detail: roleChanged ? `${roleLabel(previousRole!)} -> ${roleLabel(role)}` : roleLabel(role),
    });

    if (roleChanged) {
      await sendAdminNotice(ctx, "A user's role was changed", [
        `${email} changed from ${roleLabel(previousRole!)} to ${roleLabel(role)}.`,
      ]);
    } else if (!previousRole) {
      await sendAdminNotice(ctx, "A new user was added", [
        `${fullName} (${email}) was added as ${roleLabel(role)}.`,
      ]);
    }

    return NextResponse.json({
      ok: true,
      email,
      role,
      tenantId,
      userId,
      newAccount: Boolean(tempPassword),
      emailSent,
      // Only handed back when the email could not be sent, so the admin can
      // pass it on securely instead of leaving the new user locked out.
      tempPassword: tempPassword && !emailSent ? tempPassword : undefined,
    });
  } catch (error) {
    console.error("Invite user route error:", error);
    return bad("An unexpected error occurred while adding this user.", 500);
  }
}
