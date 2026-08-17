// DASHBOARD-C14 (2026-08-17) — Discovery shell. Founder decision 8: the waitlist is inbound
// top-of-funnel and does not justify its own entry, so it becomes a tab here. Discovery is
// outbound and the waitlist is inbound; they are separate tabs rather than one merged list
// because they are not the same motion.
import React from "react";
import WorkspaceTabs from "@/components/admin/WorkspaceTabs";
import AdminDiscovery from "./AdminDiscovery";
import AdminWaitlist from "./AdminWaitlist";

const TABS = [
  { key: "discovery", label: "Discovery", body: AdminDiscovery },
  { key: "waitlist", label: "Waitlist", body: AdminWaitlist },
];

export default function AdminDiscoveryWorkspace() {
  return <WorkspaceTabs tabs={TABS} testIdPrefix="discovery" />;
}
