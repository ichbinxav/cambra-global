import React from "react";

export default function BrandLogoWordmark({ className = "h-5" }) {
  return (
    <span
      className={`inline-block font-black tracking-[0.4em] uppercase text-black dark:text-black ${className}`}
      aria-label="CAMBRA"
    >
      CAMBRA
    </span>
  );
}