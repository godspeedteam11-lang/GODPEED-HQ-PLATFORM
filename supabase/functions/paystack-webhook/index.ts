// LegacyOS — Production Paystack Webhook Handler (Edge Function)
// Security Enforced: Fails closed on missing secrets, verifies HMAC-SHA512 signatures,
// and invokes handle_paystack_webhook RPC with service_role privileges.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  // 1. Only allow HTTP POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Fail Closed: Verify that required server environment secrets are configured
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Paystack Webhook Fatal Error: Missing required server configuration secrets.");
    return new Response(
      JSON.stringify({ error: "Webhook endpoint configuration error. Requests rejected." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    // 3. Reject request if signature header is missing
    if (!signature) {
      console.warn("Paystack Webhook Unauthorized: Missing x-paystack-signature header.");
      return new Response(JSON.stringify({ error: "Missing signature header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Verify Paystack HMAC-SHA512 Signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(PAYSTACK_SECRET_KEY);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody));
    const hashArray = Array.from(new Uint8Array(signatureBytes));
    const calculatedSignature = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signature !== calculatedSignature) {
      console.error("Paystack Webhook Security Alert: Invalid HMAC-SHA512 signature header.");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5. Parse and Validate Webhook JSON Payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (_parseErr) {
      return new Response(JSON.stringify({ error: "Malformed JSON payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = payload?.event;
    const data = payload?.data || {};
    const reference = data?.reference;

    if (!event || !reference) {
      return new Response(
        JSON.stringify({ error: "Malformed webhook payload: missing event or reference" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 6. Only process charge.success events for subscription billing
    if (event !== "charge.success") {
      return new Response(
        JSON.stringify({ message: `Ignored unhandled event: ${event}` }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 7. Initialize Privileged Supabase Admin Client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 8. Invoke Privileged Server-Side Database RPC (restricted to service_role)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "handle_paystack_webhook",
      {
        p_reference: reference,
        p_event: event,
        p_payload: payload,
      }
    );

    if (rpcError) {
      console.error("RPC handle_paystack_webhook error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, result: rpcResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Paystack Webhook Unexpected Error:", err?.message || err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
