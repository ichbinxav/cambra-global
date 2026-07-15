// CombinedChannelSection — full single-channel depth, rendered for ONE channel
// of a combined (online + in-store) analysis.
//
// Reuses the SAME single-channel components, fed with THAT channel's own
// engine_result + input_snapshot (details.engine_result.channels[i]). Never
// mixes figures across channels — each section is self-contained.
//
// Order mirrors the single-channel report:
//   PaymentsGapCard (ScoreGauge inside) → RecoveryRoadmap → PeerBenchmark
//   → PaymentsDataInsights → PaymentsInStoreInsights (in-store only, self-hides)
//
// The roadmap is built per-channel from that channel's engine_result. CTAs
// bubble up to the parent (PaymentsResults) via onRouteAction — the parent
// owns the collective/call modals and segment routing, unchanged.

import { useState, useRef } from "react";
import { CreditCard, Store } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { buildRecoveryRoadmap } from "@/lib/paymentsRoadmap.js";

import PaymentsGapCard from "@/components/paymentsResults/PaymentsGapCard";
import RecoveryRoadmap from "@/components/paymentsResults/RecoveryRoadmap";
import PeerBenchmark from "@/components/paymentsResults/PeerBenchmark";
import PaymentsDataInsights from "@/components/paymentsResults/PaymentsDataInsights";
import PaymentsInStoreInsights from "@/components/paymentsResults/PaymentsInStoreInsights";

const CHANNEL_META = {
  online: { labelKey: "analyzer_channel_online", icon: CreditCard, color: "rgb(103,232,249)", ring: "rgba(34,211,238,0.30)" },
  in_store: { labelKey: "analyzer_channel_in_store", icon: Store, color: "rgb(216,180,254)", ring: "rgba(168,85,247,0.30)" },
};

export default function CombinedChannelSection({
  channel,
  engineResult,
  inputSnapshot,
  rateTable,
  isAnonymous,
  onRouteAction,
  onUnlock,
}) {
  const { t } = useTranslation();
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const roadmapRef = useRef(null);

  if (!engineResult) return null;

  const meta = CHANNEL_META[channel] || CHANNEL_META.online;
  const Icon = meta.icon;
  const country = inputSnapshot?.country;
  const roadmap = buildRecoveryRoadmap(engineResult, inputSnapshot || {}, rateTable);

  const handleScoreCTA = () => {
    setRoadmapOpen(true);
    requestAnimationFrame(() => {
      roadmapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className="space-y-5">
      {/* Channel label */}
      <div className="flex items-center gap-2.5">
        <div
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${meta.ring}` }}
        >
          <Icon size={15} style={{ color: meta.color }} />
        </div>
        <h2
          className="uppercase font-black"
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 13,
            letterSpacing: "0.18em",
            color: meta.color,
          }}
        >
          {t(meta.labelKey)}
        </h2>
      </div>

      <PaymentsGapCard
        engineResult={engineResult}
        inputSnapshot={inputSnapshot}
        isAnonymous={isAnonymous}
        onScoreCTA={handleScoreCTA}
      />

      {roadmapOpen && roadmap && (
        <div ref={roadmapRef}>
          <RecoveryRoadmap
            roadmap={roadmap}
            isAnonymous={isAnonymous}
            onRouteAction={onRouteAction}
            onUnlock={onUnlock}
          />
        </div>
      )}

      <PeerBenchmark engineResult={engineResult} country={country} />

      <PaymentsDataInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />

      {/* In-store TPE tiles — self-hides for the online channel. */}
      <PaymentsInStoreInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
    </section>
  );
}