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
  return /googlebot|google-inspectiontool|googleweblight|adsbot-google|pagespeed|chrome-lighthouse|lighthouse|headlesschrome|rendertron|puppeteer|playwright|bingbot|slurp|duckduckbot|baiduspider|yandex|semrush|ahrefs|crawler|crawl|spider|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|pinterest|vkshare|bitlybot|whatsapp|telegrambot|discordbot|urlinspector|python-requests|postmanruntime|curl|wget|httpclient/.test(ua) || navigator.webdriver === true;
})();