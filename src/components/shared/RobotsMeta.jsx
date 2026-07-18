import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * RobotsMeta — flips the document's <meta name="robots"> tag between
 * "index, follow" (public pages) and "noindex, nofollow" (internal/app pages)
 * on every client-side navigation.
 *
 * The static index.html ships "index, follow" so crawlers that don't run JS
 * (and the home page) default to indexable. This component downgrades the
 * SAME tag to noindex,nofollow the moment an internal route is mounted, and
 * restores it when the user navigates back to a public route.
 *
 * PUBLIC (indexable) routes are an explicit allowlist — anything not on it is
 * treated as internal and gets noindex. This is the safe default: a new
 * internal page added later is noindex automatically; only pages we
 * deliberately want indexed are opted in.
 */

// Explicit allowlist of PUBLIC route path prefixes (lowercased). Matched as
// exact or prefix (so "/help/foo" counts as public via "/help").
const PUBLIC_PREFIXES = [
  "/",              // exact-only (handled below)
  "/landing",
  "/analyzer",
  // NOTE: /Results is intentionally NOT public. It's the authenticated
  // merchant report view (sensitive data). Kept OUT of the allowlist so
  // RobotsMeta emits noindex,nofollow for it — see Decision_Log_PUBLISH.md
  // and CHUNK SEO-1. Do not re-add without a dedicated shareable public route.
  "/howitworks",
  "/pricing",
  "/testimonials",
  "/contact",
  "/forproviders",
  "/for-providers",
  "/help",
  "/privacy",
  "/terms",
  "/cookies",
];

function isPublicPath(pathname) {
  const p = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => {
    if (prefix === "/") return false; // handled above (exact only)
    return p === prefix || p.startsWith(prefix + "/");
  });
}

export default function RobotsMeta() {
  const location = useLocation();

  useEffect(() => {
    let tag = document.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      document.head.appendChild(tag);
    }
    tag.setAttribute(
      "content",
      isPublicPath(location.pathname) ? "index, follow" : "noindex, nofollow"
    );
  }, [location.pathname]);

  return null;
}