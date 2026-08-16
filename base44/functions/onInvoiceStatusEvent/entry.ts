// onInvoiceStatusEvent — terminal PURGE-2 quarantine.
//
// This legacy entity-automation handler has no registered automation and its
// caller-supplied Invoice snapshot is not financial authority. Keeping the
// deployed route preserves topology while denying every invocation. Stripe
// billing state may move only through the signed webhook/manual canonical
// reconciliation paths; PURGE-2 removal remains a separate runtime operation.
Deno.serve(() =>
  Response.json(
    {
      ok: false,
      error: "route_quarantined",
      route: "onInvoiceStatusEvent",
      effects_committed: false,
      purge_pending: true,
    },
    { status: 410 },
  )
);
