import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = typeof window !== 'undefined' && window.self !== window.top;

// Basic bot detection for SSR/crawler contexts (GSC, Lighthouse, etc.)
export const isBot = (() => {
  if (typeof navigator === 'undefined') return true; // conservative: in headless render treat as bot
  const ua = (navigator.userAgent || '').toLowerCase();
  return /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|semrush|ahrefs|crawler|spider|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|pinterest|vkshare|bitlybot|whatsapp|telegrambot|discordbot/.test(ua);
})();