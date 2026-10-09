import { NextRequest, NextResponse } from "next/server";
import { smtpConfigured } from "@/lib/mailer";
import {
  TEMP_PASSWORD_HOURS,
  generateTempPassword,
  siteUrl,
  logUserAudit,
  requireTenantAdmin,
  sendAdminNotice,
  sendWelcomeEmail,
  tempPasswordMetadata,
} from "@/lib/userAdmin";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Per-user actions from the Users page:
//   reset       - new temporary password, emailed (also resends a lost invite)
//   deactivate  - blocks sign-in without deleting the user or their history
//   reactivate  - lets them sign in again
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const tenantId = str(body.tenantId);
    const userId = str(body.userId);
    const action = str(body.action);

    const ctx = await requireTenantAdmin(request, tenantId);
    if (ctx instanceof NextResponse) return ctx;
    const { admin } = ctx;

    if (!userId || !["reset", "deactivate", "reactivate"].includes(action)) {
      return bad("Choose a user and a valid action.");
    }
    if (userId === ctx.actorId) {
      return bad("You cannot do this to your own account. Use the normal password options instead.");
    }

    const { data: membership } = await admin
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!membership) return bad("That user does not belong to this tenant.", 404);

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !target.user?.email) return bad("Unable to find that user's account.", 404);
    const email = target.user.email;

    if (action === "deactivate") {
      if (membership.role === "admin") {
        const { count } = await admin
          .from("tenant_users")
          .select("user_id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("role", "admin");
        if ((count ?? 0) <= 1) return bad("You cannot deactivate the only admin.");
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (error) return bad(`Unable to deactivate: ${error.message}`, 502);
      await logUserAudit(ctx, { targetUserId: userId, targetEmail: email, action: "user_deactivated" });
      return NextResponse.json({ ok: true });
    }

    if (action === "reactivate") {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return bad(`Unable to reactivate: ${error.message}`, 502);
      await logUserAudit(ctx, { targetUserId: userId, targetEmail: email, action: "user_reactivated" });
      return NextResponse.json({ ok: true });
    }

    // reset
    const tempPassword = generateTempPassword();
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      email_confirm: true,
      ban_duration: "none",
      app_metadata: { ...(target.user.app_metadata || {}), ...tempPasswordMetadata() },
    });
    if (resetError) return bad(`Unable to reset the password: ${resetError.message}`, 502);

    const { data: details } = await admin
      .from("user_profiles")
      .select("full_name, employee_number")
      .eq("user_id", userId)
      .maybeSingle();

    let emailSent = false;
    if (smtpConfigured()) {
      try {
        await sendWelcomeEmail(email, {
          name: details?.full_name || email,
          role: membership.role as string,
          employeeNumber: details?.employee_number ?? null,
          password: tempPassword,
          origin: siteUrl(),
          hours: TEMP_PASSWORD_HOURS,
          reissued: true,
        });
        emailSent = true;
      } catch (error) {
        console.error("Reset email failed:", error);
      }
    }

    await logUserAudit(ctx, {
      targetUserId: userId,
      targetEmail: email,
      action: "password_reissued",
      detail: emailSent ? "emailed" : "email failed",
    });
    await sendAdminNotice(ctx, "A temporary password was re-issued", [
      `A new temporary password was generated for ${email}.`,
    ]);

    return NextResponse.json({
      ok: true,
      emailSent,
      tempPassword: emailSent ? undefined : tempPassword,
    });
  } catch (error) {
    console.error("User action route error:", error);
    return bad("An unexpected error occurred.", 500);
  }
}
