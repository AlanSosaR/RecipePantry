// Deno Edge Function — supabase/functions/send-push-notification/index.ts
// RecipePantry — Envía notificaciones push via Firebase Cloud Messaging HTTP v1 API
// Se activa cuando se inserta un registro en la tabla `notifications` (trigger Supabase)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FCM_PROJECT_ID = "recipepantry-e8ef8";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;
const OAUTH_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

// ── Generar JWT firmado con RS256 para OAuth ──────────────────────────────────
async function createJWT(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: OAUTH_URL,
    iat: now,
    exp: now + 3600
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${header}.${payload}`;

  // Importar clave privada RSA
  const pemKey = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${sigB64}`;
}

// ── Obtener OAuth Access Token ────────────────────────────────────────────────
async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const jwt = await createJWT(serviceAccount);

  const response = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth token error: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ── Enviar notificación FCM ───────────────────────────────────────────────────
async function sendFCMNotification(
  accessToken: string,
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  const message = {
    message: {
      token: fcmToken,
      notification: { title, body },
      data,
      webpush: {
        headers: {
          Urgency: "high",
          TTL: "3600"
        },
        notification: {
          title,
          body,
          icon:             "/assets/icons/icon.svg",
          badge:            "/assets/icons/icon.svg",
          requireInteraction: true,
          vibrate:          [200, 100, 200]
        },
        fcm_options: {
          link: data.url || "/"
        }
      }
    }
  };

  const response = await fetch(FCM_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`FCM send error: ${err}`);
  }

  console.log("✅ [FCM] Notificación enviada correctamente");
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const { user_id, notification_id, type } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Obtener Supabase client (Service Role para leer datos) ──────────────
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Obtener token FCM del usuario
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${user_id}&platform=eq.web&select=token`,
      {
        headers: {
          "apikey":        serviceRole,
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type":  "application/json"
        }
      }
    );

    const tokens = await tokenRes.json();

    if (!tokens || tokens.length === 0) {
      console.log(`ℹ️ [FCM] No hay token FCM para user_id: ${user_id}`);
      return new Response(JSON.stringify({ message: "No push token for this user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const fcmToken = tokens[0].token;

    // ── Determinar título y cuerpo según el tipo de notificación ───────────
    let title = "Recipe Pantry";
    let notifBody = "Tienes una nueva notificación";

    if (type === "recipe_shared") {
      title     = "🍳 ¡Receta compartida!";
      notifBody = "Alguien te ha compartido una receta nueva";
    }

    // ── Obtener Service Account y enviar ───────────────────────────────────
    let serviceAccountStr = Deno.env.get("FCM_SERVICE_ACCOUNT")?.trim();
    if (!serviceAccountStr) {
      throw new Error("FCM_SERVICE_ACCOUNT secret no configurado");
    }

    if ((serviceAccountStr.startsWith("'") && serviceAccountStr.endsWith("'")) ||
        (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"'))) {
      serviceAccountStr = serviceAccountStr.slice(1, -1);
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const accessToken    = await getAccessToken(serviceAccount);

    await sendFCMNotification(
      accessToken,
      fcmToken,
      title,
      notifBody,
      {
        type:            type || "general",
        notification_id: notification_id || "",
        url:             "/"
      }
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("❌ [FCM] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
