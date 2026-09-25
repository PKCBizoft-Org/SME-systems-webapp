import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const accessToken = authorization.slice(7).trim();
    const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();

    if (!tenantId) {
      return NextResponse.json(
        { error: "A tenant is required." },
        { status: 400 },
      );
    }

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
            "SUPABASE_SERVICE_ROLE_KEY is not set on the server.",
        },
        { status: 500 },
      );
    }

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

    const { data: callerMembership, error: callerMembershipError } =
      await callerClient
        .from("tenant_users")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    if (callerMembershipError || !callerMembership || callerMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only tenant admins can view this list." },
        { status: 403 },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: memberships, error: membershipError } = await adminClient
      .from("tenant_users")
      .select("user_id, role")
      .eq("tenant_id", tenantId);

    if (membershipError) {
      return NextResponse.json(
        { error: `Unable to load tenant users: ${membershipError.message}` },
        { status: 500 },
      );
    }

    const userIds = (memberships || []).map((m) => m.user_id);

    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, email, role")
      .in("id", userIds);

    if (profilesError) {
      return NextResponse.json(
        { error: `Unable to load profiles: ${profilesError.message}` },
        { status: 500 },
      );
    }

    /*
      auth.admin.listUsers() is paginated. 200 per page comfortably
      covers a small-to-mid tenant; if this ever needs to scale much
      further, this would need to loop through pages instead.
    */
    const { data: authUsersPage, error: authUsersError } =
      await adminClient.auth.admin.listUsers({ perPage: 200 });

    if (authUsersError) {
      return NextResponse.json(
        { error: `Unable to load account status: ${authUsersError.message}` },
        { status: 500 },
      );
    }

    const authUserMap = new Map(
      authUsersPage.users.map((u) => [u.id, u]),
    );
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const invitedByIds = Array.from(
      new Set(
        (memberships || [])
          .map((m) => authUserMap.get(m.user_id)?.user_metadata?.invited_by_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const invitedByEmailMap = new Map<string, string>();
    invitedByIds.forEach((id) => {
      const authUser = authUserMap.get(id);
      if (authUser?.email) {
        invitedByEmailMap.set(id, authUser.email);
      }
    });

    const users = (memberships || []).map((m) => {
      const profile = profileMap.get(m.user_id);
      const authUser = authUserMap.get(m.user_id);

      const invitedById = authUser?.user_metadata?.invited_by_id as
        | string
        | undefined;
      const invitedByEmailFromMetadata = authUser?.user_metadata
        ?.invited_by_email as string | undefined;

      return {
        id: m.user_id,
        email: profile?.email || authUser?.email || "(no email on file)",
        profileRole: profile?.role || null,
        tenantRole: m.role,
        status: authUser?.last_sign_in_at ? "active" : "pending",
        invitedByEmail:
          invitedByEmailFromMetadata ||
          (invitedById ? invitedByEmailMap.get(invitedById) : null) ||
          null,
      };
    });

    users.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("List users route error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while loading users." },
      { status: 500 },
    );
  }
}