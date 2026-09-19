import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhilippineMobile(
  value: string
) {
  const raw = value.trim().replace(/[^\d+]/g, "");

  if (raw.startsWith("+63")) {
    return `63${raw.slice(3)}`;
  }

  if (raw.startsWith("63")) {
    return raw;
  }

  if (raw.startsWith("09")) {
    return `63${raw.slice(1)}`;
  }

  if (raw.startsWith("9") && raw.length === 10) {
    return `63${raw}`;
  }

  return raw;
}

export async function POST(
  request: NextRequest
) {
  try {
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error:
            "Authentication is required.",
        },
        { status: 401 }
      );
    }

    const accessToken =
      authorization.slice(7).trim();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const semaphoreApiKey =
      process.env.SEMAPHORE_API_KEY;

    const semaphoreSenderName =
      process.env.SEMAPHORE_SENDER_NAME;

    if (
      !supabaseUrl ||
      !supabaseAnonKey
    ) {
      return NextResponse.json(
        {
          error:
            "Supabase server configuration is missing.",
        },
        { status: 500 }
      );
    }

    if (!semaphoreApiKey) {
      return NextResponse.json(
        {
          error:
            "SMS service is not configured. Add SEMAPHORE_API_KEY to the server environment.",
        },
        { status: 500 }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      );

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(
      accessToken
    );

    if (
      userError ||
      !userData.user
    ) {
      return NextResponse.json(
        {
          error:
            "Your session is invalid or expired.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const clientId =
      typeof body.clientId === "string"
        ? body.clientId.trim()
        : "";

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            "A customer is required.",
        },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        {
          error:
            "A message is required.",
        },
        { status: 400 }
      );
    }

    if (message.length > 640) {
      return NextResponse.json(
        {
          error:
            "The SMS message is too long.",
        },
        { status: 400 }
      );
    }

    /*
      IMPORTANT:
      This query deliberately uses the authenticated user's
      Supabase session instead of the service-role key.
      Your existing clients RLS policies therefore remain
      responsible for tenant isolation.
    */
    const {
      data: client,
      error: clientError,
    } = await supabase
      .from("clients")
      .select(
        "id, customer_name, mobile_number, tenant_id"
      )
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) {
      console.error(
        "SMS client lookup error:",
        clientError
      );

      return NextResponse.json(
        {
          error:
            "The customer could not be verified.",
        },
        { status: 500 }
      );
    }

    if (!client) {
      return NextResponse.json(
        {
          error:
            "Customer not found or you are not authorized to message this customer.",
        },
        { status: 404 }
      );
    }

    if (!client.mobile_number) {
      return NextResponse.json(
        {
          error:
            "This customer does not have a mobile number saved.",
        },
        { status: 400 }
      );
    }

    const recipient =
      normalizePhilippineMobile(
        client.mobile_number
      );

    if (
      !/^639\d{9}$/.test(recipient)
    ) {
      return NextResponse.json(
        {
          error:
            "The customer's mobile number is not a valid Philippine mobile number.",
        },
        { status: 400 }
      );
    }

    const form = new URLSearchParams();

    form.set(
      "apikey",
      semaphoreApiKey
    );

    form.set(
      "number",
      recipient
    );

    form.set(
      "message",
      message
    );

    if (semaphoreSenderName) {
      form.set(
        "sendername",
        semaphoreSenderName
      );
    }

    const semaphoreResponse =
      await fetch(
        "https://api.semaphore.co/api/v4/messages",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          cache: "no-store",
        }
      );

    const raw =
      await semaphoreResponse.text();

    let semaphoreData:
      | unknown
      | null = null;

    try {
      semaphoreData =
        JSON.parse(raw);
    } catch {
      semaphoreData = raw;
    }

    if (
      !semaphoreResponse.ok
    ) {
      console.error(
        "Semaphore SMS error:",
        semaphoreData
      );

      return NextResponse.json(
        {
          error:
            "The SMS provider rejected the request.",
          providerStatus:
            semaphoreResponse.status,
        },
        { status: 502 }
      );
    }

    const first =
      Array.isArray(
        semaphoreData
      )
        ? semaphoreData[0]
        : null;

    return NextResponse.json({
      ok: true,
      recipient,
      customerName:
        client.customer_name,
      messageId:
        first?.message_id ?? null,
      providerStatus:
        first?.status ?? null,
    });
  } catch (error) {
    console.error(
      "SMS send route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "An unexpected error occurred while sending the SMS.",
      },
      { status: 500 }
    );
  }
}
