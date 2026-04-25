import React from "react";

export default function BrandGlyph({ className = "w-5 h-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cambra-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1F4ED8" />
          <stop offset="100%" stopColor="#2CA7C1" />
        </linearGradient>
      </defs>
      <path d="M48 16 A16 16 0 1 0 48 48" fill="none" stroke="url(#cambra-g)" strokeWidth="12" strokeLinecap="round" />
      <circle cx="32" cy="32" r="6" fill="url(#cambra-g)" />
    </svg>
  );
}