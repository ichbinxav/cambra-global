// Admin-only legacy diagnostic. The former implementation crossed a real
// network boundary without the durable webhook claim/Emergency contract.
// Keep the physical compatibility endpoint fail-closed until it is migrated
// to the canonical dispatchWebhook + WebhookDeadLetter authority.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { internalErrorResponse } from "../../shared/publicErrors.ts";

const QUARANTINE_REASON =
  "SEND_TEST_WEBHOOK_MATERIAL_EFFECT_AUTHORITY_REQUIRED";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    return Response.json({
      ok: false,
      status: "QUARANTINED",
      error: "send_test_webhook_quarantined",
      reason: QUARANTINE_REASON,
      provider_effect_started: false,
      retry_allowed: false,
      canonical_route: "dispatchWebhook",
    }, { status: 410 });
  } catch (error) {
    return internalErrorResponse(error, "sendTestWebhook");
  }
});
