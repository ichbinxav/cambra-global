import React from "react";

export default function HexOrbital({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 900"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="hexStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(36,76,138,0.28)" />
          <stop offset="100%" stopColor="rgba(199,183,244,0.30)" />
        </linearGradient>
        <filter id="softBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      {/* subtle paper tint */}
      <rect x="0" y="0" width="1440" height="900" fill="url(#paperTint)" opacity="0" />

      {/* orbit rings */}
      <g className="orbit-slow" style={{ transformOrigin: '50% 45%' }}>
        <circle cx="720" cy="380" r="300" fill="none" stroke="url(#hexStroke)" strokeWidth="1" />
        <circle cx="720" cy="380" r="410" fill="none" stroke="url(#hexStroke)" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx="720" cy="380" r="520" fill="none" stroke="url(#hexStroke)" strokeOpacity="0.35" strokeWidth="1" />
      </g>

      {/* hex network nodes */}
      <g stroke="url(#hexStroke)" strokeWidth="1" fill="none">
        {[
          { x: 260, y: 220, s: 26 },
          { x: 1160, y: 240, s: 22 },
          { x: 980, y: 520, s: 28 },
          { x: 430, y: 560, s: 24 },
          { x: 720, y: 140, s: 20 },
        ].map((h, i) => (
          <polygon key={i}
            points={hexPoints(h.x, h.y, h.s)}
            opacity="0.6"
          />
        ))}
      </g>

      {/* connecting lines */}
      <g stroke="rgba(36,76,138,0.22)" strokeWidth="1" filter="url(#softBlur)">
        <line x1="260" y1="220" x2="720" y2="380" />
        <line x1="1160" y1="240" x2="720" y2="380" />
        <line x1="430" y1="560" x2="980" y2="520" />
        <line x1="430" y1="560" x2="720" y2="380" />
        <line x1="980" y1="520" x2="720" y2="380" />
      </g>

      {/* nodes */}
      <g fill="#244c8a" opacity="0.6">
        <circle cx="260" cy="220" r="2.5" />
        <circle cx="1160" cy="240" r="2.5" />
        <circle cx="980" cy="520" r="2.5" />
        <circle cx="430" cy="560" r="2.5" />
        <circle cx="720" cy="380" r="3" opacity="0.8" />
      </g>
    </svg>
  );
}

function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6; // flat-top
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts.map(p => p.join(',')).join(' ');
}