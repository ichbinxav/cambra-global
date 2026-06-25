import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = typeof window !== 'undefined' && window.self !== window.top;

// Broad bot/inspection detection to avoid auth/network calls during SEO tools rendering
export const isBot = (() => {
  if (typeof navigator === 'undefined') return true; // headless render → treat as bot
  const ua = (navigator.userAgent || '').toLowerCase();
  // Genuine crawlers / automation only — do NOT match in-app browsers
  // (whatsapp, telegram, instagram, facebookexternalhit, linkedinbot, etc.)
  // which real human users open the app from on mobile.
  return /googlebot|google-inspectiontool|googleweblight|adsbot-google|pagespeed|chrome-lighthouse|lighthouse|headlesschrome|rendertron|puppeteer|playwright|bingbot|slurp|duckduckbot|baiduspider|yandex|semrush|ahrefs|crawler|crawl|spider|urlinspector|python-requests|postmanruntime|curl|wget|httpclient/.test(ua) || navigator.webdriver === true;
})();