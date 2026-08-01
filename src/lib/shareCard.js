// shareCard — GROWTH-1 T1 (2026-08-01). Client-side canvas renderer for the
// shareable result card (1080×1080, Instagram/WhatsApp square).
//
// PRIVACY CONTRACT (sealed): the card renders ONLY —
//   · the possible fee-reduction percentage (e.g. "hasta un 24% menos") — HERO
//   · the efficiency score (e.g. "72/100"), when available — secondary badge
//   · the CAMBRA brand + a generic CTA line
//   · the business name ONLY when the user explicitly toggled it on
// It NEVER renders: savings in euros, monthly sales, the current provider,
// or the effective rate.
//
// v2 REDESIGN (2026-08-01): centered editorial composition with the EXACT
// landing gradient family (#0a0a0a → #0b0e1a → #0a0d18 → #0b1020 → #08090f),
// landing accents blue #3b82f6 / cyan #22d3ee, the 44px landing grid,
// a gradient-border glass frame, and a figure-hero white→cyan number —
// so the shared image is unmistakably the same design system as cambra.global.

const S = 1080;
const CX = S / 2;

const grotesk = (weight, px) => `${weight} ${px}px 'Space Grotesk', 'Inter', sans-serif`;
const inter = (weight, px) => `${weight} ${px}px 'Inter', sans-serif`;

function drawTrackedCentered(ctx, text, cx, y, tracking) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + tracking;
  total -= tracking;
  let x = cx - total / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
}

function fitFont(ctx, text, fontFor, startPx, minPx, maxW) {
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

// Downward trend arrow — "costs going down", drawn as vector.
function drawTrendDown(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.34, y + size * 0.36);
  ctx.lineTo(x + size * 0.58, y + size * 0.14);
  ctx.lineTo(x + size, y + size * 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size, y + size * 0.62);
  ctx.lineTo(x + size * 0.64, y + size * 0.62);
  ctx.moveTo(x + size, y + size * 0.62);
  ctx.lineTo(x + size, y + size * 0.26);
  ctx.stroke();
  ctx.restore();
}

function drawScoreRing(ctx, cx, cy, r, score, strokeGrad) {
  ctx.save();
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
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
  try { await document.fonts.ready; } catch { /* fallback fonts */ }

  // ── Background: EXACT landing gradient ────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, "#0a0a0a");
  bg.addColorStop(0.25, "#0b0e1a");
  bg.addColorStop(0.55, "#0a0d18");
  bg.addColorStop(0.8, "#0b1020");
  bg.addColorStop(1, "#08090f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Ambient orbs — landing blue top, cyan bottom.
  let glow = ctx.createRadialGradient(CX, -120, 0, CX, -120, 620);
  glow.addColorStop(0, "rgba(59,130,246,0.32)");
  glow.addColorStop(1, "rgba(59,130,246,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  glow = ctx.createRadialGradient(S - 100, S - 80, 0, S - 100, S - 80, 560);
  glow.addColorStop(0, "rgba(34,211,238,0.18)");
  glow.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // Landing 44px grid — faint white lines, fading toward the bottom.
  ctx.save();
  const gridFade = ctx.createLinearGradient(0, 0, 0, S);
  gridFade.addColorStop(0, "rgba(255,255,255,0.045)");
  gridFade.addColorStop(0.6, "rgba(255,255,255,0.025)");
  gridFade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = gridFade;
  ctx.lineWidth = 1;
  for (let x = 0; x <= S; x += 44) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }
  for (let y = 0; y <= S; y += 44) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  ctx.restore();

  // ── Glass frame with gradient border (blue → cyan) ─────────────────────
  const F = 44; // frame inset
  const frameGrad = ctx.createLinearGradient(F, F, S - F, S - F);
  frameGrad.addColorStop(0, "rgba(59,130,246,0.65)");
  frameGrad.addColorStop(0.5, "rgba(255,255,255,0.10)");
  frameGrad.addColorStop(1, "rgba(34,211,238,0.65)");

  ctx.fillStyle = "rgba(255,255,255,0.025)";
  roundRect(ctx, F, F, S - F * 2, S - F * 2, 40);
  ctx.fill();
  ctx.strokeStyle = frameGrad;
  ctx.lineWidth = 2;
  roundRect(ctx, F, F, S - F * 2, S - F * 2, 40);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  // ── Header: wordmark + eyebrow, centered ───────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = grotesk(900, 46);
  ctx.fillText("CAMBRA", CX, 158);

  ctx.font = inter(700, 19);
  ctx.fillStyle = "#22d3ee";
  drawTrackedCentered(ctx, strings.eyebrow, CX, 202, 7);

  // Thin accent rule under the header.
  const ruleGrad = ctx.createLinearGradient(CX - 60, 0, CX + 60, 0);
  ruleGrad.addColorStop(0, "rgba(59,130,246,0)");
  ruleGrad.addColorStop(0.5, "rgba(34,211,238,0.9)");
  ruleGrad.addColorStop(1, "rgba(59,130,246,0)");
  ctx.fillStyle = ruleGrad;
  ctx.fillRect(CX - 60, 226, 120, 3);

  // ── HERO: the reduction percentage ─────────────────────────────────────
  const pct = reductionPct !== null && reductionPct !== undefined ? reductionPct : null;

  if (pct !== null) {
    // "hasta un" chip — glass pill with cyan trend icon, centered.
    ctx.font = inter(600, 27);
    const preW = ctx.measureText(strings.reductionPrefix).width;
    const chipW = preW + 104;
    const chipX = CX - chipW / 2;
    const chipY = 292;
    ctx.fillStyle = "rgba(34,211,238,0.08)";
    roundRect(ctx, chipX, chipY, chipW, 60, 30);
    ctx.fill();
    ctx.strokeStyle = "rgba(34,211,238,0.35)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, chipX, chipY, chipW, 60, 30);
    ctx.stroke();
    drawTrendDown(ctx, chipX + 26, chipY + 17, 30, "#22d3ee");
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "left";
    ctx.fillText(strings.reductionPrefix, chipX + 74, chipY + 40);
    ctx.textAlign = "center";

    // Giant number + % — figure-hero gradient (white → cyan), cyan halo.
    const pctStr = String(pct);
    const numPx = 390;
    ctx.font = grotesk(900, numPx);
    const numW = ctx.measureText(pctStr).width;
    ctx.font = grotesk(900, 150);
    const symW = ctx.measureText("%").width;
    const totalW = numW + 18 + symW;
    const numX = CX - totalW / 2;
    const baseY = 692;

    const heroGrad = ctx.createLinearGradient(0, baseY - numPx * 0.75, 0, baseY);
    heroGrad.addColorStop(0, "#ffffff");
    heroGrad.addColorStop(0.55, "#b8e8f5");
    heroGrad.addColorStop(1, "#22d3ee");

    ctx.save();
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(34,211,238,0.4)";
    ctx.shadowBlur = 90;
    ctx.font = grotesk(900, numPx);
    ctx.fillStyle = heroGrad;
    ctx.fillText(pctStr, numX, baseY);
    ctx.shadowBlur = 0;
    ctx.font = grotesk(900, 150);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("%", numX + numW + 18, baseY);
    ctx.restore();

    // suffix — centered, bold white.
    fitFont(ctx, strings.reductionSuffix, (px) => grotesk(800, px), 56, 30, S - 200);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(strings.reductionSuffix, CX, 772);
  }

  // ── Secondary: score badge with mini gauge, centered ───────────────────
  if (score !== null && score !== undefined) {
    const by = pct !== null ? 816 : 440;
    const bh = 92;
    ctx.font = inter(600, 23);
    const labelW = ctx.measureText(strings.scoreLabel).width;
    const bw = Math.min(S - 200, labelW + 190);
    const bx = CX - bw / 2;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, bx, by, bw, bh, 46);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, bw, bh, 46);
    ctx.stroke();

    const ringGrad = ctx.createLinearGradient(bx + 20, by, bx + 100, by + bh);
    ringGrad.addColorStop(0, "#3b82f6");
    ringGrad.addColorStop(1, "#22d3ee");
    drawScoreRing(ctx, bx + 54, by + bh / 2, 28, score, ringGrad);

    ctx.font = grotesk(900, 27);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(score), bx + 54, by + bh / 2 + 10);

    ctx.textAlign = "left";
    ctx.font = inter(600, 23);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(strings.scoreLabel, bx + 104, by + bh / 2 - 3);
    ctx.font = inter(700, 20);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(`${score}/100`, bx + 104, by + bh / 2 + 27);
    ctx.textAlign = "center";
  }

  // ── Footer: optional brand name + CTA, centered inside the frame ───────
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(CX - 420, 936, 840, 1.5);

  let footY = 978;
  if (brandName) {
    ctx.font = inter(700, 26);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(brandName, CX, footY);
    footY = 1014;
    ctx.font = inter(600, 22);
  } else {
    footY = 996;
  }
  const cta = `${strings.cta} → ${strings.site}/Analyzer`;
  fitFont(ctx, cta, (px) => inter(600, px), 26, 18, S - 220);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(cta, CX, footY);

  ctx.textAlign = "left";
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}