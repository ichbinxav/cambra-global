import React from "react";

export default function BrandLogoWordmark({ className = "h-5" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="CAMBRA">
      <img
        src="https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png"
        alt="CAMBRA"
        className="h-6 w-6 rounded-md"
      />
      <span className="font-black tracking-[0.4em] uppercase text-foreground">CAMBRA</span>
    </span>
  );
}