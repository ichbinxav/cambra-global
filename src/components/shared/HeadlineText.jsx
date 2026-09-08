import React from "react";

/** Renders every sentence of a plain-text headline on its own line. */
export default function HeadlineText({ children }) {
  if (typeof children !== "string") return children;
  const lines = children
    .replace(/([.!?]+)\s+/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return children;
  return lines.map((line, index) => (
    <React.Fragment key={`${line}-${index}`}>
      {index > 0 && <br />}
      {line}
    </React.Fragment>
  ));
}
