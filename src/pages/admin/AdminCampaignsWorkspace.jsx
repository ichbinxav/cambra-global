// DASHBOARD-C14 (2026-08-17) — Campaigns shell. Founder decision 5: Commercial OS (lead
// filtering and CSV export) belongs with Campaigns. Both pages are mounted unchanged.
import React from "react";
import WorkspaceTabs from "@/components/admin/WorkspaceTabs";
import AdminCampaigns from "./AdminCampaigns";
import AdminCommercialOS from "./AdminCommercialOS";

const TABS = [
  { key: "campaigns", label: "Campaigns", body: AdminCampaigns },
  { key: "commercial", label: "Commercial OS", body: AdminCommercialOS },
];

export default function AdminCampaignsWorkspace() {
  return <WorkspaceTabs tabs={TABS} testIdPrefix="campaigns" />;
}
