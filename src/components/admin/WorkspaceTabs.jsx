// DASHBOARD-C14 (2026-08-17) — the shared workspace tab shell.
//
// Finance (C9), Intelligence (C11) and Recover (C13) each grew their own copy of this. C14
// needs four more shells to absorb the routes the founder mapped, so the fifth copy became the
// shared one instead.
//
// The rule the shell exists to hold: a tab declared in the registry must be SERVED by the page
// the registry points at. `dashboard:navigation:check` resolves each redirect's destination to a
// file and fails if the tab is not in a key position there — a redirect to a tab nobody serves
// is a blank page, which is how the Contracts surface nearly disappeared in C13.
import React from "react";
import { useSearchParams } from "react-router-dom";

/**
 * @param {{ tabs: Array<{ key: string, label: string, body: React.ComponentType }>, testIdPrefix: string }} props
 */
export default function WorkspaceTabs({ tabs, testIdPrefix }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") || tabs[0]?.key;
  const active = tabs.some((tab) => tab.key === requested) ? requested : tabs[0]?.key;
  const Body = tabs.find((tab) => tab.key === active)?.body || null;

  return (
    <div className="space-y-4">
      {/* One tab is not a tab bar. A single-tab shell renders only its body. */}
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 flex-wrap border-b border-border/50">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={tab.key === active}
              data-testid={`${testIdPrefix}-tab-${tab.key}`}
              onClick={() => setParams((next) => {
                const updated = new URLSearchParams(next);
                updated.set("tab", tab.key);
                return updated;
              })}
              className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px ${
                tab.key === active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {Body ? <Body /> : (
        <p data-testid={`${testIdPrefix}-tab-unbuilt`} className="text-xs text-muted-foreground py-12 text-center">
          This tab has no body yet.
        </p>
      )}
    </div>
  );
}
