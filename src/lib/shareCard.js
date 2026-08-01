// shareCard — GROWTH-1 T1 (2026-08-01). Client-side canvas renderer for the
// shareable result card (1080×1080, Instagram/WhatsApp square).
//
// PRIVACY CONTRACT (sealed): the card renders ONLY —
//   · the efficiency score (e.g. "72/100"), when available
//   · the possible fee-reduction percentage (e.g. "hasta un 24% menos")
//   · the CAMBRA brand + a generic CTA line
//   · the business name ONLY when the user explicitly toggled it on
// It NEVER renders: savings in euros, monthly sales, the current provider,
// or the effective rate. Reason: € savings + a % lets anyone derive the
// business's sales volume — sensitive even when shared voluntarily.
//
// Brand tokens used verbatim from src/index.css: --voltio #5B4CF5,
// --voltio-2 #8B7BFF, --cian #39C6F0, dark canvas #0E0E1A/#14112e,
// Space Grotesk for display type (self-hosted fonts already loaded by the
// page; we await document.fonts.ready before drawing).

const S = 1080;
const MARGIN = 84;

const grotesk = (weight, px) => `${weight} ${px}px 'Space Grotesk', 'Inter', sans-serif`;
const inter = (weight, px) => `${weight} ${px}px 'Inter', sans-serif`;

function drawTracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

// Shrink font size until `text` fits the printable width.
function fitFont(ctx, text, fontFor, startPx, minPx) {
  let px = startPx;
  ctx.font = fontFor(px);
  while (ctx.measureText(text).width > S - MARGIN * 2 && px > minPx) {
    px -= 2;
    ctx.font = fontFor(px);
  }
  return px;
}

export async function renderShareCard({ score, reductionPct, brandName, strings }) {
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  try { await document.fonts.ready; } catch { /* draw with fallback fonts */ }

  // ── Canvas: dark navy gradient + aurora glows ──────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, "#0a0a0a");
  bg.addColorStop(0.4, "#14112e");
  bg.addColorStop(1, "#0E0E1A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  let glow = ctx.createRadialGradient(150, 130, 0, 150, 130, 540);
  glow.addColorStop(0, "rgba(91,76,245,0.35)");
  glow.addColorStop(1, "rgba(91,76,245,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  glow = ctx.createRadialGradient(S - 120, S - 150, 0, S - 120, S - 150, 580);
  glow.addColorStop(0, "rgba(57,198,240,0.20)");
  glow.addColorStop(1, "rgba(57,198,240,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // Condensing dot mesh — denser toward the bottom-right corner (brand motif).
  for (let x = 0; x <= S; x += 26) {
    for (let y = 0; y <= S; y += 26) {
      const d = Math.hypot(S - x, S - y) / S; // 0 at the corner
      const a = Math.max(0, 0.18 - d * 0.2);
      if (a <= 0.012) continue;
      ctx.fillStyle = `rgba(139,123,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textBaseline = "alphabetic";

  // ── Wordmark + eyebrow ─────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = grotesk(900, 58);
  ctx.fillText("CAMBRA", MARGIN, 150);

  ctx.font = inter(700, 24);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  drawTracked(ctx, strings.eyebrow, MARGIN, 226, 6);

  const textGradient = (y0, y1) => {
    const g = ctx.createLinearGradient(MARGIN, y0, S - MARGIN, y1);
    g.addColorStop(0, "#8B7BFF");
    g.addColorStop(1, "#39C6F0");
    return g;
  };

  if (score !== null && score !== undefined) {
    // ── Score hero mode ──────────────────────────────────────────────────
    ctx.font = grotesk(900, 290);
    ctx.fillStyle = textGradient(330, 620);
    const scoreStr = String(score);
    ctx.fillText(scoreStr, MARGIN - 8, 590);
    const w = ctx.measureText(scoreStr).width;
    ctx.font = grotesk(700, 82);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("/100", MARGIN + w + 8, 590);

    ctx.font = inter(600, 34);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(strings.scoreLabel, MARGIN, 656);

    // Reduction line — single line, auto-shrunk to fit.
    if (reductionPct !== null && reductionPct !== undefined) {
      const line = `${strings.reductionPrefix} ${reductionPct}% ${strings.reductionSuffix}`;
      fitFont(ctx, line, (px) => grotesk(800, px), 56, 30);
      ctx.fillStyle = textGradient(740, 780);
      ctx.fillText(line, MARGIN, 776);
    }
  } else {
    // ── Reduction hero mode (no score available) ─────────────────────────
    ctx.font = inter(600, 40);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(strings.reductionPrefix, MARGIN, 400);

    ctx.font = grotesk(900, 300);
    ctx.fillStyle = textGradient(430, 700);
    ctx.fillText(`−${reductionPct}%`, MARGIN - 8, 660);

    fitFont(ctx, strings.reductionSuffix, (px) => grotesk(800, px), 52, 30);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(strings.reductionSuffix, MARGIN, 748);
  }

  // ── Footer: divider · optional brand name · CTA ────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(MARGIN, 880, S - MARGIN * 2, 2);

  let footY = 946;
  if (brandName) {
    ctx.font = inter(700, 32);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(brandName, MARGIN, footY);
    footY = 1006;
  } else {
    footY = 972;
  }
  const cta = `${strings.cta} → ${strings.site}/Analyzer`;
  fitFont(ctx, cta, (px) => inter(600, px), 30, 20);
  ctx.fillStyle = "#39C6F0";
  ctx.fillText(cta, MARGIN, footY);

  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}