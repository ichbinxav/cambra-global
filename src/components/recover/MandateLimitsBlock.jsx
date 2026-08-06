// MandateLimitsBlock — v61 Checkpoint H (2026-08-06).
//
// The limits-of-authority clause, rendered from the SERVER-provided mandate copy
// (getRecoverAcceptanceContext → mandate_copy) and never restated here.
//
// WHY THIS COMPONENT EXISTS: the acceptance popup used to carry its own English
// paragraph ("We charge X% … for 24 months … you can revoke…"). That paragraph
// was a fourth copy of legal wording that already lives in exactly one place
// (base44/shared/recoverMandateCopy.ts, which the contractual PDF is built from),
// and it hardcoded the 24-month duration, so a policy change would have moved the
// PDF and left the popup behind.
//
// EN was specified as a bullet list, FR/ES as prose — hence two shapes. Both come
// from the server; this component only chooses the layout. It renders NOTHING when
// the server sent no copy, because inventing a legal clause client-side is worse
// than omitting one: the checkbox text (also server-provided) still states the
// terms the merchant is accepting.

export default function MandateLimitsBlock({ copy }) {
  const title = copy?.titles?.limits;
  const body = Array.isArray(copy?.limits_body) ? copy.limits_body.filter(Boolean) : [];
  const bullets = Array.isArray(copy?.limits_bullets) ? copy.limits_bullets.filter(Boolean) : [];

  if (!body.length && !bullets.length) return null;

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/65 leading-relaxed">
      {title && <p className="text-xs font-semibold text-white/80 mb-2">{title}</p>}

      {body.map((p, i) => (
        <p key={`b${i}`} className={i > 0 ? "mt-2" : undefined}>{p}</p>
      ))}

      {bullets.length > 0 && (
        <ul className={body.length ? "mt-2 space-y-1" : "space-y-1"}>
          {bullets.map((b, i) => (
            <li key={`l${i}`} className="flex gap-2">
              <span className="text-white/35 shrink-0">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}