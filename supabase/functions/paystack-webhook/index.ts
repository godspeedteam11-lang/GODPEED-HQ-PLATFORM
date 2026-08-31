// Follow this setup guide to deploy: https://supabase.com/docs/guides/functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    // 1. Verify Paystack HMAC SHA512 Signature
    if (PAYSTACK_SECRET_KEY) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(PAYSTACK_SECRET_KEY);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
      const hashArray = Array.from(new Uint8Array(signatureBytes));
      const calculatedSignature = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (signature !== calculatedSignature) {
        console.error("Invalid Paystack webhook signature header");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const data = payload.data || {};
    const reference = data.reference;

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Initialize Privileged Supabase Admin Client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Call Server-Side RPC
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
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
