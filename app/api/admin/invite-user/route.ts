import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TenantRole = "admin" | "technician" | "customer" | "accounting";

const ALLOWED_ROLES: TenantRole[] = [
  "admin",
  "technician",
  "customer",
  "accounting",
];

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const accessToken = authorization.slice(7).trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase server configuration is missing." },
        { status: 500 },
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it to your environment variables (never expose it to the browser) to enable account creation.",
        },
        { status: 500 },
      );
    }

    /*
      This client uses the caller's own session, so it is subject
      to the same RLS policies as the rest of the app — it can only
      see what the requesting admin is actually allowed to see.
    */
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userError } =
      await callerClient.auth.getUser(accessToken);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Your session is invalid or expired." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";
    const tenantId =
      typeof body.tenantId === "string" ? body.tenantId.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (!ALLOWED_ROLES.includes(role as TenantRole)) {
      return NextResponse.json(
        { error: "Role must be admin, technician, or customer." },
        { status: 400 },
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "A tenant is required." },
        { status: 400 },
      );
    }

    /*
      Confirm the caller is actually an admin of the tenant they are
      inviting into. This is the check that stops any authenticated
      user from inviting themselves into a tenant they don't run.
    */
    const { data: callerMembership, error: callerMembershipError } =
      await callerClient
        .from("tenant_users")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    if (callerMembershipError) {
      return NextResponse.json(
        { error: "Unable to verify your admin access." },
        { status: 500 },
      );
    }

    if (!callerMembership || callerMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only tenant admins can invite users." },
        { status: 403 },
      );
    }

    /*
      Everything past this point uses the service-role key. It never
      reaches the browser, and it is only reached after the admin
      check above has already passed.
    */
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let invitedUserId: string | null = null;

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          invited_by_email: userData.user.email,
          invited_by_id: userData.user.id,
        },
      });

    if (inviteError) {
      const alreadyRegistered = inviteError.message
        ?.toLowerCase()
        .includes("already been registered");

      if (!alreadyRegistered) {
        return NextResponse.json(
          { error: `Unable to invite this user: ${inviteError.message}` },
          { status: 502 },
        );
      }

      /*
        The person already has an account (maybe from another tenant
        or a prior invite). Look them up instead of failing, so an
        admin can still grant them access to this tenant.
      */
      const { data: existingUsers, error: listError } =
        await adminClient.auth.admin.listUsers();

      if (listError) {
        return NextResponse.json(
          { error: "Unable to look up the existing account." },
          { status: 502 },
        );
      }

      const existing = existingUsers.users.find(
        (u) => u.email?.toLowerCase() === email,
      );

      if (!existing) {
        return NextResponse.json(
          {
            error:
              "This email is already registered, but the matching account could not be found.",
          },
          { status: 502 },
        );
      }

      invitedUserId = existing.id;
    } else {
      invitedUserId = inviteData.user?.id ?? null;
    }

    if (!invitedUserId) {
      return NextResponse.json(
        { error: "Unable to determine the invited user's ID." },
        { status: 502 },
      );
    }

    /*
      Mirror the two-table setup this project already uses:
      profiles.role is the app-wide role, tenant_users links the
      person to this specific tenant with a role scoped to it.
    */
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: invitedUserId,
        email,
        role,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      return NextResponse.json(
        { error: `Unable to save the user's profile: ${profileError.message}` },
        { status: 500 },
      );
    }

    const { data: existingMembership } = await adminClient
      .from("tenant_users")
      .select("user_id")
      .eq("user_id", invitedUserId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingMembership) {
      const { error: updateError } = await adminClient
        .from("tenant_users")
        .update({ role })
        .eq("user_id", invitedUserId)
        .eq("tenant_id", tenantId);

      if (updateError) {
        return NextResponse.json(
          { error: `Unable to update tenant access: ${updateError.message}` },
          { status: 500 },
        );
      }
    } else {
      const { error: insertError } = await adminClient
        .from("tenant_users")
        .insert({ user_id: invitedUserId, tenant_id: tenantId, role });

      if (insertError) {
        return NextResponse.json(
          { error: `Unable to grant tenant access: ${insertError.message}` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      email,
      role,
      tenantId,
      userId: invitedUserId,
    });
  } catch (error) {
    console.error("Invite user route error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while inviting this user." },
      { status: 500 },
    );
  }
}