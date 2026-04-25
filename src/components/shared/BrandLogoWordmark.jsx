import React from "react";

export default function BrandLogoWordmark({ className = "h-5" }) {
  return (
    <span
      className={`inline-block font-black tracking-[0.4em] uppercase text-saas-gradient ${className}`}
      style={{ WebkitTextFillColor: "transparent", WebkitBackgroundClip: "text" }}
      aria-label="CAMBRA"
    >
      CAMBRA
    </span>
  );
}