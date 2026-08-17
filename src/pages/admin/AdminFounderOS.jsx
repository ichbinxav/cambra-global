// DASHBOARD-C14 (2026-08-17) — Founder OS shell.
//
// Founder decisions 1, 2 and 3:
//
//   1. AdminOverview becomes the BODY of Founder OS. It is 400 lines against AdminCommand's
//      50, so it is the content and Founder OS is the entry — not the other way round. It is
//      the default tab for that reason.
//   2. /admin/inbox is the FOUNDER queue (AgentQuestion, AgentTask, Approval), kept apart from
//      /admin/conversations, which is the merchant thread surface.
//   3. Inbox and Approvals merge into ONE founder queue, because two separate queues is how
//      one of them gets ignored.
//
// HONEST LIMIT ON DECISION 3: this puts both surfaces in one place, which is the navigation
// decision. It does NOT merge them into a single ranked list — that needs a projection over
// three differently-shaped sources (AgentQuestion, AgentTask, Approval) with one ordering, and
// inventing that ordering here would be a guess about which item a founder should see first.
// Declared as the remaining step rather than implied by the tab label.
import React from "react";
import { AlertTriangle } from "lucide-react";
import WorkspaceTabs from "@/components/admin/WorkspaceTabs";
import AdminOverview from "./AdminOverview";
import AdminCommand from "./AdminCommand";
import AdminInbox from "./AdminInbox";
import AdminApprovals from "./AdminApprovals";

function FounderQueue() {
  return (
    <div className="space-y-4">
      <div data-testid="queue-fusion-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          Questions, tasks and approvals are in one place but still in two lists. A single ranked
          queue needs one ordering across three differently-shaped sources; until that exists,
          read both.
        </span>
      </div>
      <AdminInbox />
      <AdminApprovals />
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview", body: AdminOverview },
  { key: "command", label: "Command summary", body: AdminCommand },
  { key: "queue", label: "Queue", body: FounderQueue },
];

export default function AdminFounderOS() {
  return <WorkspaceTabs tabs={TABS} testIdPrefix="founder-os" />;
}
