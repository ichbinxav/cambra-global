// DASHBOARD-C14 (2026-08-17) — Settings shell.
//
// Founder decisions 6 and 7:
//
//   6. Commercial Autonomy is a STANDING control — outbound sending policy, changed rarely —
//      so it belongs in Settings rather than in Campaigns, which is daily work.
//   7. Users & Companies is platform user administration. Merchants is the client surface;
//      this is a different concern.
import React from "react";
import WorkspaceTabs from "@/components/admin/WorkspaceTabs";
import AdminSettings from "./AdminSettings";
import AdminCommercialAutonomy from "./AdminCommercialAutonomy";
import AdminUsers from "./AdminUsers";

const TABS = [
  { key: "settings", label: "Settings", body: AdminSettings },
  { key: "autonomy", label: "Commercial autonomy", body: AdminCommercialAutonomy },
  { key: "users", label: "Users & companies", body: AdminUsers },
];

export default function AdminSettingsWorkspace() {
  return <WorkspaceTabs tabs={TABS} testIdPrefix="settings" />;
}
