import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * The canonical CAMBRA lock-up. Headers and workspace navigation may vary in
 * density, but the mark, wordmark proportions and spacing stay identical.
 */
export default function HeaderBrand({
  to = "/",
  tone = "dark",
  externalCue = false,
  className = "",
  ariaLabel = "CAMBRA",
}) {
  const inverse = tone === "dark";

  return (
    <Link
      to={to}
      className={`cambra-header-brand ${inverse ? "is-inverse" : ""} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <img
        src={inverse ? BRAND_ASSETS.cMarkWhite : BRAND_ASSETS.cMarkVoltio}
        alt=""
        width={24}
        height={24}
        draggable={false}
      />
      <span>CAMBRA</span>
      {externalCue && <ArrowUpRight className="cambra-header-brand__cue" size={11} aria-hidden="true" />}
    </Link>
  );
}
