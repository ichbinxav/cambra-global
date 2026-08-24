const NON_PRODUCTION_HEALTH_PROVIDERS = new Set([
  "demo_provider",
  "demo_apikey_provider",
  "demo_basicauth_provider",
  "stripe_self",
  "stripe_self_test",
]);

export const INTEGRATION_HEALTH_SCOPE_VERSION =
  "production-integration-health-scope-1.0.0";

export function integrationHealthScope(integration: any) {
  const provider = String(integration?.provider || "").trim().toLowerCase();
  if (NON_PRODUCTION_HEALTH_PROVIDERS.has(provider)) {
    return {
      included: false,
      provider,
      reason: "internal_test_or_dogfood_provider",
    };
  }
  return { included: true, provider, reason: null };
}

export function productionIntegrationHealthIssue(
  integration: any,
  nowMs = Date.now(),
) {
  const scope = integrationHealthScope(integration);
  if (!scope.included) return false;
  if (integration?.status === "error") return true;
  return integration?.status === "connected" &&
    Boolean(integration?.last_sync_at) &&
    nowMs - Date.parse(integration.last_sync_at) > 7 * 86_400_000;
}
