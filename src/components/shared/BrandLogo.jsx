import React from "react";

const WORDMARK_URL = "https://media.base44.com/images/public/69b8bcd2986e2cf428289270/a387bef67_0F7CCAEA-78A6-48BD-BA62-E4A450BE7E74.png";
const SYMBOL_URL = "https://media.base44.com/images/public/69b8bcd2986e2cf428289270/0fcb39459_DC70B665-96C8-4B91-99FE-8191044349D6.png";

export default function BrandLogo({ variant = "wordmark", className = "", alt = "THE NODE" }) {
  const src = variant === "symbol" ? SYMBOL_URL : WORDMARK_URL;
  return (
    <img
      src={src}
      alt={alt}
      className={className || (variant === "symbol" ? "h-6 w-6 object-contain" : "h-6 object-contain")}
      loading="eager"
      decoding="async"
    />
  );
}