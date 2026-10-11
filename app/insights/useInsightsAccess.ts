"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";

const supabase = createClient();

export type InsightsAccess = {
  checking: boolean;
  authorized: boolean;
  roles: string[];
  permissions: string[];
};

/**
 * Signs the visitor in (or sends them to /login), loads their staff roles and
 * the permissions the database gives them, and sends them back to /clients
 * unless they hold `permission`. The database repeats this check inside every
 * insights function, so hiding a page here is only a courtesy.
 */
export function useInsightsAccess(permission: string): InsightsAccess {
  const router = useRouter();
  const [state, setState] = useState<InsightsAccess>({ checking: true, authorized: false, roles: [], permissions: [] });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error || !data.session) {
        router.replace("/login");
        return;
      }
      const [memberships, perms] = await Promise.all([
        supabase.from("tenant_users").select("role").eq("user_id", data.session.user.id),
        supabase.rpc("my_permissions"),
      ]);
      if (cancelled) return;
      const roles = (memberships.data || []).map((m) => m.role).filter((r): r is string => Boolean(r));
      const permissions = Array.isArray(perms.data) ? (perms.data as string[]) : [];
      if (!permissions.includes(permission)) {
        router.replace("/clients");
        return;
      }
      setState({ checking: false, authorized: true, roles, permissions });
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router, permission]);

  return state;
}
