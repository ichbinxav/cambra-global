// stripeJs — RECOVER-2 (2026-08-03).
//
// Loads Stripe.js from Stripe's own CDN, once per page, and returns a Stripe
// instance for the publishable key the BACKEND resolved (never a key hardcoded
// in the frontend — the mode lives on the server, so the browser can never
// accidentally talk to live while the backend is in test).
//
// Stripe.js MUST be loaded from js.stripe.com — bundling it is not permitted by
// Stripe and breaks PCI scope, which is why this is a script tag and not an npm
// dependency.

let scriptPromise = null;

/** @typedef {Window & typeof globalThis & { Stripe?: (publishableKey: string) => any }} StripeWindow */

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const stripeWindow = /** @type {StripeWindow} */ (window);
    if (stripeWindow.Stripe) return resolve(stripeWindow.Stripe);
    const el = document.createElement("script");
    el.src = "https://js.stripe.com/v3/";
    el.async = true;
    el.onload = () => (stripeWindow.Stripe ? resolve(stripeWindow.Stripe) : reject(new Error("stripe_js_unavailable")));
    el.onerror = () => reject(new Error("stripe_js_load_failed"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export async function getStripe(publishableKey) {
  const Stripe = await loadScript();
  return Stripe(publishableKey);
}