import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { assertBillingAccount, getPublishableKey, getSecretKey, stripeRequest } from "../../shared/stripeBilling.ts";
import { captureEmergencyEpoch, guardedEmergencyEffect } from "../../shared/operationalControl.ts";

const PURPOSE = "cambra_checkin_wallet_demo_v1";
const HOSTS = ["cambra.global", "www.cambra.global"];
const PROFILES = ["none", "email", "all"];
const TTL = 6 * 60 * 60;
const enc = new TextEncoder();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const fail = (code: string) => { throw new Error(code); };
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s: string) { return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
async function hmacKey() {
  return crypto.subtle.importKey("raw", enc.encode(PURPOSE + ":" + getSecretKey("live")), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueTicket() {
  const payload = b64(enc.encode(JSON.stringify({ purpose: PURPOSE, id: crypto.randomUUID(), exp: Math.floor(Date.now()/1000)+TTL })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return payload+"."+b64(new Uint8Array(signature));
}
async function verifyTicket(raw: unknown): Promise<{id: string; exp: number}> {
  if (typeof raw !== "string" || raw.length > 1000) fail("invitation_required");
  const parts = (raw as string).split(".");
  if (parts.length !== 2) fail("invitation_invalid");
  try {
    if (!await crypto.subtle.verify("HMAC", await hmacKey(), unb64(parts[1]), enc.encode(parts[0]))) fail("invitation_invalid");
    const p = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const now = Math.floor(Date.now()/1000);
    if (p.purpose !== PURPOSE || !/^[a-f0-9-]{36}$/.test(p.id) || !Number.isInteger(p.exp) || p.exp <= now || p.exp > now+TTL+60) fail("invitation_expired");
    return p;
  } catch { fail("invitation_invalid_or_expired"); }
  throw new Error("invitation_invalid");
}
async function stripeGet(path: string, params: Record<string,string> | null = null) {
  const r = await stripeRequest("live", "GET", path, params);
  if (!r.ok) fail("stripe_read_failed");
  return r.data;
}
async function domainState(host: string) {
  const domains = await stripeGet("payment_method_domains", { domain_name: host, limit: "10" });
  return domains.data?.find((d: any) => d.domain_name === host) || null;
}
const domainSummary = (d: any) => ({ enabled: !!d?.enabled, apple_pay: d?.apple_pay?.status || "not_registered", google_pay: d?.google_pay?.status || "not_registered" });
function safeContact(pm: any) {
  const b = pm?.billing_details || {};
  return { email: b.email || null, name: b.name || null, phone: b.phone || null, address: b.address || null };
}
function flags(pm: any) {
  const b = safeContact(pm);
  return { email: !!b.email, name: !!b.name, phone: !!b.phone, address: !!b.address && Object.values(b.address).some(Boolean) };
}
export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await req.text();
    if (raw.length > 8192) return json({ error: "request_too_large" }, 413);
    let body: any;
    try { body = JSON.parse(raw || "{}"); } catch { return json({ error: "invalid_json" }, 400); }
    const action = body.action || "status";
    const host = HOSTS.includes(body.host) ? body.host : "cambra.global";
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const admin = user?.role === "admin";
    // All live operations use CAMBRA's own pinned account, never merchant OAuth.
    await assertBillingAccount("live");
    const pk = getPublishableKey("live");
    const svc = base44.asServiceRole;
    const write = async (path: string, params: Record<string,string>, key: string) => {
      const claim = await captureEmergencyEpoch(svc, "billing_issuance");
      const r = await guardedEmergencyEffect(svc, { claim, effect_key: PURPOSE+":"+key,
        effect: () => stripeRequest("live", "POST", path, params, PURPOSE+":"+key) });
      if (!r.ok) fail("stripe_write_failed");
      return r.data;
    };

    // Fixed CAMBRA domains are provisioned by the service for this public demo.
    const ensureDomain = async () => {
      let d = await domainState(host);
      if (!d) d = await write("payment_method_domains", { domain_name: host }, "domain:"+host);
      else if (!d.enabled) d = await write("payment_method_domains/"+d.id, { enabled: "true" }, "enable:"+d.id);
      if (d.apple_pay?.status !== "active") d = await write("payment_method_domains/"+d.id+"/validate", {}, "validate:"+d.id+":"+Math.floor(Date.now()/300000));
      return d;
    };
    if (action === "status") {
      const domain = await ensureDomain();
      // Public entry: each browser gets its own signed capability, never a shared result.
      let sessionTicket = body.ticket;
      if (sessionTicket) await verifyTicket(sessionTicket);
      else sessionTicket = await issueTicket();
      return json({ ok: true, mode: "live", admin, public_access: true, ticket: sessionTicket,
        domain: domainSummary(domain), host, publishable_key: pk, build: PURPOSE + "_public" });
    }
    if (["register_domain", "recent"].includes(action) && !admin) return json({ error: "admin_required" }, 403);
    if (action === "register_domain") return json({ domain: domainSummary(await ensureDomain()) });
    if (action === "invite" || action === "new_session") return json({ ticket: await issueTicket(), expires_in: TTL });
    if (action === "recent") {
      const list = await stripeGet("setup_intents", { limit: "100", "expand[]": "data.payment_method" });
      return json({ trials: (list.data || []).filter((s: any) => s.metadata?.purpose === PURPOSE).slice(0,20).map((s: any) => ({
        id: s.id, created: s.created, status: s.status, profile: s.metadata.profile,
        wallet: s.payment_method?.card?.wallet?.type || null, fields: flags(s.payment_method),
        attached: !!s.payment_method?.customer,
      })), scope: "latest_100_setup_intents" });
    }
    const ticket = await verifyTicket(body.ticket);
    if (!PROFILES.includes(body.profile)) return json({ error: "profile_invalid" }, 400);
    const trial = ticket.id+":"+body.profile;
    if (action === "setup") {
      if (body.consent !== "wallet-demo-v1") return json({ error: "consent_required" }, 400);
      const domain = await domainState(host);
      if (!domain?.enabled) return json({ error: "domain_not_registered" }, 409);
      const customer = await write("customers", {
        description: "CAMBRA CHECK-IN — personal wallet trial",
        "metadata[purpose]": PURPOSE, "metadata[session]": ticket.id,
      }, "customer:"+ticket.id);
      const si = await write("setup_intents", {
        customer: customer.id, usage: "off_session", "payment_method_types[0]": "card",
        "metadata[purpose]": PURPOSE, "metadata[session]": ticket.id, "metadata[profile]": body.profile,
        "metadata[consent]": "wallet-demo-v1", "metadata[consent_scope]": "save_for_trial_only_no_future_charges",
      }, "setup:"+trial);
      return json({ client_secret: si.client_secret, setup_intent_id: si.id, mode: "live" });
    }
    if (action === "hosted_setup") {
      if (body.consent !== "wallet-demo-v1") return json({ error: "consent_required" }, 400);
      if (body.profile !== "email") return json({ error: "profile_invalid" }, 400);
      const customer = await write("customers", {
        description: "CAMBRA CHECK-IN — personal wallet trial",
        "metadata[purpose]": PURPOSE, "metadata[session]": ticket.id,
      }, "customer:"+ticket.id);
      const cs = await write("checkout/sessions", {
        mode: "setup", currency: "eur", customer: customer.id,
        "payment_method_types[0]": "card", locale: "es",
        success_url: "https://cambra.global/checkin-demo?checkout_session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://cambra.global/checkin-demo?checkout_cancelled=1",
        "custom_text[submit][message]": "Prueba de CAMBRA CHECK-IN: guardas el método solo para esta prueba. No autorizas cobros futuros. Si te pide escribir datos, puedes cancelar.",
        "metadata[purpose]": PURPOSE, "metadata[session]": ticket.id, "metadata[profile]": "email",
        "setup_intent_data[metadata][purpose]": PURPOSE,
        "setup_intent_data[metadata][session]": ticket.id,
        "setup_intent_data[metadata][profile]": "email",
        "setup_intent_data[metadata][consent]": "wallet-demo-v1",
        "setup_intent_data[metadata][consent_scope]": "save_for_trial_only_no_future_charges",
      }, "hosted-v1:"+trial);
      if (!cs.url || new URL(cs.url).hostname !== "checkout.stripe.com" || cs.mode !== "setup" || cs.livemode !== true) fail("stripe_write_failed");
      return json({ url: cs.url, checkout_session_id: cs.id, mode: "live", profile: "email" });
    }
    if (action === "hosted_result") {
      if (!/^cs_live_[A-Za-z0-9]+$/.test(body.checkout_session_id || "")) return json({ error: "checkout_id_invalid" }, 400);
      const cs = await stripeGet("checkout/sessions/"+body.checkout_session_id);
      if (cs.metadata?.purpose !== PURPOSE || cs.metadata?.session !== ticket.id || cs.metadata?.profile !== body.profile || cs.livemode !== true || cs.mode !== "setup") return json({ error: "trial_not_owned" }, 403);
      if (!cs.setup_intent) return json({ status: cs.status === "expired" ? "expired" : "requires_payment_method", saved: false, mode: "live", future_charges_authorized: false });
      body.setup_intent_id = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent.id;
    }
    if (!["result", "detach", "hosted_result"].includes(action)) return json({ error: "action_invalid" }, 400);
    if (!/^seti_[A-Za-z0-9]+$/.test(body.setup_intent_id || "")) return json({ error: "setup_id_invalid" }, 400);
    const si = await stripeGet("setup_intents/"+body.setup_intent_id, { "expand[]": "payment_method" });
    if (si.metadata?.purpose !== PURPOSE || si.metadata?.session !== ticket.id || si.metadata?.profile !== body.profile || si.livemode !== true) return json({ error: "trial_not_owned" }, 403);
    const pm = si.payment_method;
    if (action === "detach") {
      if (si.status !== "succeeded" || !pm?.id) return json({ error: "trial_not_complete" }, 409);
      if (pm.customer && pm.customer !== si.customer) return json({ error: "customer_mismatch" }, 403);
      if (pm.customer) await write("payment_methods/"+pm.id+"/detach", {}, "detach:"+si.id);
      return json({ detached: true });
    }
    return json({ status: si.status, saved: si.status === "succeeded" && !!pm?.customer && pm.customer === si.customer,
      mode: "live", wallet: pm?.card?.wallet?.type || null,
      card: pm?.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null,
      contact: si.status === "succeeded" ? safeContact(pm) : null,
      fields: si.status === "succeeded" ? flags(pm) : null,
      setup_intent_id: si.id, future_charges_authorized: false });
  } catch (error: any) {
    const message = String(error?.message || "");
    const known = ["invitation_required","invitation_invalid","invitation_expired","invitation_invalid_or_expired",
      "stripe_read_failed","stripe_write_failed"];
    const code = known.includes(message) ? message
      : message.startsWith("stripe_key_missing") ? "stripe_live_key_missing"
      : message.startsWith("stripe_wrong_account") ? "stripe_wrong_account"
      : message.startsWith("stripe_account_unreachable") ? "stripe_account_unreachable"
      : /EMERGENCY|emergency/i.test(message+" "+String(error?.code || "")) ? "operational_control_paused"
      : "wallet_demo_unavailable";
    return json({ ok: false, error: code }, code.startsWith("invitation") ? 403 : 503);
  }
}
Deno.serve(handler);
