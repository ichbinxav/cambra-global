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
// DECISION 3 IS NOW COMPLETE. C14 put both surfaces in one place and said plainly that it had
// not merged them into one ranked list. C16 does: founderQueueCore projects Approval,
// AgentQuestion and AgentTask into one list under a DECLARED ordering rule, and the UI renders
// that rule beside the items so it can be argued with rather than trusted.
import React from "react";
import WorkspaceTabs from "@/components/admin/WorkspaceTabs";
import AdminOverview from "./AdminOverview";
import AdminCommand from "./AdminCommand";
import FounderQueue from "@/components/admin/FounderQueue";

// DASHBOARD-C16: the queue is now ONE ranked list with a declared ordering, so the stacked
// pair and its caveat are gone. The two source pages remain reachable by URL; what the founder
// asked for was one queue, and this is it.
const TABS = [
  { key: "overview", label: "Overview", body: AdminOverview },
  { key: "command", label: "Command summary", body: AdminCommand },
  { key: "queue", label: "Queue", body: FounderQueue },
];

export default function AdminFounderOS() {
  return <WorkspaceTabs tabs={TABS} testIdPrefix="founder-os" />;
}
