// Sends a push notification to every phone registered for a user, through
// Firebase Cloud Messaging (HTTP v1). Called by the database trigger
// notify_payment_result with a shared secret.
//
// Secret needed (Supabase dashboard > Edge Functions > Secrets):
//   FCM_SERVICE_ACCOUNT = the full contents of the Firebase service-account JSON
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function b64url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(account: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(sig)}`,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Google token error: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

Deno.serve(async (req) => {
  const { data: cfg } = await admin.from("push_config").select("secret").limit(1).maybeSingle();
  if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) return new Response("FCM_SERVICE_ACCOUNT is not set", { status: 500 });
  const account = JSON.parse(raw);

  const { user_id, title, body } = await req.json();
  if (!user_id || !title) return new Response("Bad request", { status: 400 });

  const { data: tokens } = await admin.from("push_tokens").select("token").eq("user_id", user_id);
  if (!tokens?.length) return Response.json({ sent: 0 });

  const bearer = await accessToken(account);
  let sent = 0;

  for (const { token } of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { token, notification: { title, body: body ?? "" }, android: { priority: "HIGH" } },
      }),
    });
    if (res.ok) {
      sent += 1;
    } else if (res.status === 404) {
      // Token no longer valid (app uninstalled): forget it.
      await admin.from("push_tokens").delete().eq("token", token);
    }
  }

  return Response.json({ sent });
});
