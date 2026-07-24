// InitialsAvatar — honest placeholder avatar for testimonials.
//
// Renders a colored circle with the person's initials. NO external
// dependency, NO photo — deliberately NOT a photo-realistic face, because
// pairing a fake face + fake quote as a "real customer" is misleading
// advertising (fake-testimonial rules). Initials avatars read clearly as
// illustration, so they're safe for placeholder testimonials.
//
// Color is DETERMINISTIC from the name (same name → same color every render),
// picked from a small on-brand palette that reads well on dark surfaces.

const PALETTE = [
  { bg: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)", fg: "#ffffff" },
  { bg: "linear-gradient(135deg, #7c3aed 0%, var(--voltio-2) 100%)", fg: "#ffffff" },
  { bg: "linear-gradient(135deg, #0ea5e9 0%, #2dd4bf 100%)", fg: "#04121a" },
  { bg: "linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)", fg: "#ffffff" },
  { bg: "linear-gradient(135deg, #10b981 0%, #a3e635 100%)", fg: "#04121a" },
  { bg: "linear-gradient(135deg, var(--voltio) 0%, var(--voltio-2) 100%)", fg: "#ffffff" },
];

function initialsOf(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function InitialsAvatar({ name, size = 40, className = "" }) {
  const { bg, fg } = colorFor(name);
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 font-bold ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size * 0.36,
        letterSpacing: "-0.02em",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );
}