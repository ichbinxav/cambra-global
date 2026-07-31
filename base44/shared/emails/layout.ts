// emails/layout — the shared HTML shell for every merchant-facing email.
//
// EMAIL-1 (2026-07-31). Extracted so the per-language template modules carry
// ONLY words, never markup. The visual design is byte-for-byte the one that
// was inlined in the functions before this chunk — EMAIL-1 changes language,
// not looks.

export function shell(inner: string): string {
  return [
    `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:40px 32px;color:#111;">`,
    inner,
    `</div>`,
  ].join('');
}

export function eyebrow(text: string): string {
  return `<p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#999;margin-bottom:24px;">${text}</p>`;
}

export function h1(text: string): string {
  return `<h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;line-height:1.05;margin-bottom:12px;">${text}</h1>`;
}

export function p(text: string, marginBottom = 20): string {
  return `<p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:${marginBottom}px;">${text}</p>`;
}

export function footer(text: string): string {
  return `<p style="font-size:12px;color:#aaa;line-height:1.6;border-top:1px solid #eee;padding-top:16px;margin-top:32px;">${text}</p>`;
}

export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:100px;">${label}</a>`;
}

export type Email = { subject: string; html: string };