import { Navigate, useParams, useLocation } from "react-router-dom";

// v62 H1 — /help/:slug is an ALIAS, not a second renderer. It redirects (replace,
// so it leaves no history entry and cannot loop) to the canonical /Help/:slug,
// preserving the slug, the query string and the hash.
export default function HelpSlugRedirect() {
  const { slug } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`/Help/${slug}${search}${hash}`} replace />;
}