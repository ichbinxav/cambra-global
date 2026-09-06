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

import { useTranslation } from "@/lib/i18n.jsx";
import GmvSlider from "@/components/paymentsAnalyzer/GmvSlider";
import AvgTicketInput from "@/components/paymentsAnalyzer/AvgTicketInput";
import IntlSlider from "@/components/paymentsAnalyzer/IntlSlider";
import ProviderGrid from "@/components/paymentsAnalyzer/ProviderGrid";

function ChannelPanel({ title, subtitle, accentColor, children }) {
  return (
    <section className="analyzer-channel-panel">
      <div className="relative z-10">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.22em] font-bold"
              style={{ color: accentColor === "var(--voltio)" ? "var(--voltio-2)" : accentColor }}
            >
              {title}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--az-muted, rgba(255,255,255,0.7))" }}>{subtitle}</p>
          </div>
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </section>
  );
}

export default function CombinedChannelBlock({
  onlineValue,
  onOnlineChange,
  inStoreValue,
  onInStoreChange,
  onlineProviders,
  inStoreProviders,
  currency = "EUR",
}) {
  const { t } = useTranslation();
  const patchOnline = (patch) => onOnlineChange({ ...onlineValue, ...patch });
  const patchInStore = (patch) => onInStoreChange({ ...inStoreValue, ...patch });

  return (
    <div className="space-y-4">
      {/* ONLINE block */}
      <ChannelPanel
        title={t("analyzer_channel_online")}
        subtitle={t("az_ch_online_sub")}
        accentColor="var(--voltio)"
      >
        <GmvSlider
          value={onlineValue.monthly_gmv_eur}
          onChange={(v) => patchOnline({ monthly_gmv_eur: v })}
          currency={currency}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6">
          <AvgTicketInput
            value={onlineValue.avg_ticket_eur}
            onChange={(v) => patchOnline({ avg_ticket_eur: v })}
            currency={currency}
          />
          <IntlSlider
            value={onlineValue.intl_pct}
            onChange={(v) => patchOnline({ intl_pct: v })}
          />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--az-label, rgba(255,255,255,0.85))" }}>
              {t("az_online_provider_label")}
            </span>
            <span className="text-[10px]" style={{ color: "var(--az-subtle, rgba(255,255,255,0.5))" }}>{t("az_one_tap")}</span>
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
        title={t("analyzer_channel_in_store")}
        subtitle={t("az_ch_instore_sub")}
        accentColor="var(--voltio-2)"
      >
        <GmvSlider
          value={inStoreValue.monthly_gmv_eur}
          onChange={(v) => patchInStore({ monthly_gmv_eur: v })}
          currency={currency}
        />
        <AvgTicketInput
          value={inStoreValue.avg_ticket_eur}
          onChange={(v) => patchInStore({ avg_ticket_eur: v })}
          currency={currency}
        />
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--az-label, rgba(255,255,255,0.85))" }}>
              {t("az_tpv_label")}
            </span>
            <span className="text-[10px]" style={{ color: "var(--az-subtle, rgba(255,255,255,0.5))" }}>{t("az_one_tap")}</span>
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
