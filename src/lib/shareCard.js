// shareCard — GROWTH-1 T1 (2026-08-01). Client-side canvas renderer for the
// shareable result card (1080×1080, Instagram/WhatsApp square).
//
// PRIVACY CONTRACT (sealed): the card renders ONLY —
//   · the possible fee-reduction percentage (e.g. "hasta un 24% menos") — HERO
//   · the efficiency score (e.g. "72/100"), when available — secondary badge
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

// Shrink font size until `text` fits a given width.
function fitFont(ctx, text, fontFor, startPx, minPx, maxW = S - MARGIN * 2) {
  let px = startPx;
  ctx.font = fontFor(px);
  while (ctx.measureText(text).width > maxW && px > minPx) {
    px -= 2;
    ctx.font = fontFor(px);
  }
  return px;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Downward trend arrow — the "costs going down" icon. Drawn as vector so it
// never depends on an icon font being loaded.
function drawTrendDown(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.34, y + size * 0.36);
  ctx.lineTo(x + size * 0.58, y + size * 0.14);
  ctx.lineTo(x + size, y + size * 0.62);
  ctx.stroke();
  // arrow head
  ctx.beginPath();
  ctx.moveTo(x + size, y + size * 0.62);
  ctx.lineTo(x + size * 0.64, y + size * 0.62);
  ctx.moveTo(x + size, y + size * 0.62);
  ctx.lineTo(x + size, y + size * 0.26);
  ctx.stroke();
  ctx.restore();
}

// Small circular score gauge — arc filled proportionally to score/100.
function drawScoreRing(ctx, cx, cy, r, score, strokeGrad) {
  ctx.save();
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = strokeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, Math.max(0, score))) / 100);
  ctx.stroke();
  ctx.restore();
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

  let glow = ctx.createRadialGradient(150, 130, 0, 150, 130, 560);
  glow.addColorStop(0, "rgba(91,76,245,0.40)");
  glow.addColorStop(1, "rgba(91,76,245,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  glow = ctx.createRadialGradient(S - 120, S - 150, 0, S - 120, S - 150, 600);
  glow.addColorStop(0, "rgba(57,198,240,0.24)");
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

  const textGradient = (y0, y1) => {
    const g = ctx.createLinearGradient(MARGIN, y0, S - MARGIN, y1);
    g.addColorStop(0, "#8B7BFF");
    g.addColorStop(1, "#39C6F0");
    return g;
  };

  // ── Wordmark + eyebrow ─────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = grotesk(900, 54);
  ctx.fillText("CAMBRA", MARGIN, 136);

  ctx.font = inter(700, 22);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  drawTracked(ctx, strings.eyebrow, MARGIN, 190, 6);

  // ── HERO: the reduction percentage, as big as it gets ──────────────────
  const pct = reductionPct !== null && reductionPct !== undefined ? reductionPct : null;

  if (pct !== null) {
    // prefix ("hasta un") as a small glass chip with the trend icon
    ctx.font = inter(600, 28);
    const preW = ctx.measureText(strings.reductionPrefix).width;
    const chipW = preW + 104;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, MARGIN, 262, chipW, 62, 31);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, MARGIN, 262, chipW, 62, 31);
    ctx.stroke();
    drawTrendDown(ctx, MARGIN + 26, 280, 30, "#39C6F0");
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = inter(600, 28);
    ctx.fillText(strings.reductionPrefix, MARGIN + 76, 303);

    // The number — enormous, with a soft glow behind it.
    const pctStr = String(pct);
    ctx.font = grotesk(900, 360);
    const numW = ctx.measureText(pctStr).width;
    ctx.save();
    ctx.shadowColor = "rgba(91,76,245,0.55)";
    ctx.shadowBlur = 70;
    ctx.font = grotesk(900, 360);
    ctx.fillStyle = textGradient(380, 660);
    ctx.fillText(pctStr, MARGIN - 14, 640);
    ctx.restore();

    ctx.font = grotesk(900, 140);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("%", MARGIN - 14 + numW + 16, 640);

    // suffix ("menos en comisiones")
    fitFont(ctx, strings.reductionSuffix, (px) => grotesk(800, px), 62, 32);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(strings.reductionSuffix, MARGIN, 726);
  }

  // ── Secondary: score badge with a mini gauge ───────────────────────────
  if (score !== null && score !== undefined) {
    const bx = MARGIN;
    const by = pct !== null ? 772 : 420;
    const bh = 96;
    ctx.font = inter(600, 24);
    const labelW = ctx.measureText(strings.scoreLabel).width;
    const bw = Math.min(S - MARGIN * 2, labelW + 208);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, bx, by, bw, bh, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 24);
    ctx.stroke();

    const ringGrad = ctx.createLinearGradient(bx + 20, by, bx + 100, by + bh);
    ringGrad.addColorStop(0, "#8B7BFF");
    ringGrad.addColorStop(1, "#39C6F0");
    drawScoreRing(ctx, bx + 60, by + bh / 2, 30, score, ringGrad);

    ctx.textAlign = "center";
    ctx.font = grotesk(900, 30);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(score), bx + 60, by + bh / 2 + 11);
    ctx.textAlign = "left";

    ctx.font = inter(600, 24);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(strings.scoreLabel, bx + 116, by + bh / 2 - 2);
    ctx.font = inter(700, 22);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(`${score}/100`, bx + 116, by + bh / 2 + 30);
  }

  // ── Footer: divider · optional brand name · CTA ────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(MARGIN, 906, S - MARGIN * 2, 2);

  let footY = 962;
  if (brandName) {
    ctx.font = inter(700, 30);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(brandName, MARGIN, footY);
    footY = 1014;
  } else {
    footY = 986;
  }
  const cta = `${strings.cta} → ${strings.site}/Analyzer`;
  fitFont(ctx, cta, (px) => inter(600, px), 29, 20);
  ctx.fillStyle = "#39C6F0";
  ctx.fillText(cta, MARGIN, footY);

  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}