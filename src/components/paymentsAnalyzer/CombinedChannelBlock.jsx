// CombinedChannelBlock — dual-form block for the "Combined" analyzer mode.
//
// Renders TWO stacked sub-forms (one per channel) so a merchant can declare
// both their online and in-store payment infrastructure in a single submit.
// Each channel owns its own {provider_slug, monthly_gmv_eur, avg_ticket_eur}
// and — for online only — intl_pct.
//
// Design contract:
//   - Value shape mirrors the backend payload:
//       {
//         online:   { provider_slug, monthly_gmv_eur, avg_ticket_eur, intl_pct },
//         in_store: { provider_slug, monthly_gmv_eur, avg_ticket_eur },
//       }
//   - Uses the SAME slider/input components as the single-channel form so
//     the visual language is consistent. No duplication of logic.
//   - Providers per channel come from the parent (same enums used by the
//     backend allowlist). Country lives at the top level (parent), not per
//     channel — a merchant is in one country.

import GmvSlider from "@/components/paymentsAnalyzer/GmvSlider";
import AvgTicketInput from "@/components/paymentsAnalyzer/AvgTicketInput";
import IntlSlider from "@/components/paymentsAnalyzer/IntlSlider";
import ProviderGrid from "@/components/paymentsAnalyzer/ProviderGrid";

function ChannelPanel({ title, subtitle, accentColor, children }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] font-bold"
            style={{ color: accentColor }}
          >
            {title}
          </p>
          <p className="text-[11px] text-white/45 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export default function CombinedChannelBlock({
  onlineValue,
  onOnlineChange,
  inStoreValue,
  onInStoreChange,
  onlineProviders,
  inStoreProviders,
}) {
  const patchOnline = (patch) => onOnlineChange({ ...onlineValue, ...patch });
  const patchInStore = (patch) => onInStoreChange({ ...inStoreValue, ...patch });

  return (
    <div className="space-y-4">
      {/* ONLINE block */}
      <ChannelPanel
        title="Online"
        subtitle="Card-not-present · your PSP (Stripe, PayPal…)"
        accentColor="rgb(103,232,249)"
      >
        <GmvSlider
          value={onlineValue.monthly_gmv_eur}
          onChange={(v) => patchOnline({ monthly_gmv_eur: v })}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6">
          <AvgTicketInput
            value={onlineValue.avg_ticket_eur}
            onChange={(v) => patchOnline({ avg_ticket_eur: v })}
          />
          <IntlSlider
            value={onlineValue.intl_pct}
            onChange={(v) => patchOnline({ intl_pct: v })}
          />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Online provider
            </span>
            <span className="text-[10px] text-white/35">One tap</span>
          </div>
          <ProviderGrid
            options={onlineProviders}
            value={onlineValue.provider_slug}
            onChange={(v) => patchOnline({ provider_slug: v })}
          />
        </div>
      </ChannelPanel>

      {/* IN-STORE block */}
      <ChannelPanel
        title="In-store"
        subtitle="Card-present · your TPV / physical terminal"
        accentColor="rgb(216,180,254)"
      >
        <GmvSlider
          value={inStoreValue.monthly_gmv_eur}
          onChange={(v) => patchInStore({ monthly_gmv_eur: v })}
        />
        <AvgTicketInput
          value={inStoreValue.avg_ticket_eur}
          onChange={(v) => patchInStore({ avg_ticket_eur: v })}
        />
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              In-store terminal (TPV)
            </span>
            <span className="text-[10px] text-white/35">One tap</span>
          </div>
          <ProviderGrid
            options={inStoreProviders}
            value={inStoreValue.provider_slug}
            onChange={(v) => patchInStore({ provider_slug: v })}
          />
        </div>
      </ChannelPanel>
    </div>
  );
}