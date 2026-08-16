// DSCV2-C (2026-08-16) — real company (organization) enrichment for Discovery
// V2's SELECTIVE_COMPANY_ENRICHMENT stage. Until this round, the
// COMPANY_ENRICHMENT operation of leadEnrichmentAgent was an explicit no-op
// ("NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED") and the stage silently did
// nothing. This module is the missing adapter: Apollo's Organization
// Enrichment endpoint (same provider already used for discovery), mapped into
// the OutboundLead firmography fields.
//
// HONESTY RULES (same as the rate table):
// - A field is written ONLY when Apollo actually returned the underlying
//   value. Empty is correct; invented is not.
// - estimated_tpv_min_eur / estimated_tpv_max_eur are NEVER written here:
//   Apollo does not return TPV. The snapshot records that explicitly.
// - Person data is never touched here — contact resolution stays a separate,
//   governed contact-last operation.
//
// Lives in shared (not in the agent entry) so behavior tests can invoke the
// real mapping and the real write path without Deno.serve.
import { normalizeDiscoveryDomain } from './discoveryRadar.ts';
import { reservePaidOperation, settlePaidOperation } from './costGovernance.ts';
import { safeBestEffort } from './bestEffort.ts';

const ECOMMERCE_PLATFORMS = [
  'shopify',
  'woocommerce',
  'magento',
  'adobe commerce',
  'prestashop',
  'bigcommerce',
  'salesforce commerce',
  'shopware',
  'squarespace',
  'vtex',
  'wix',
];

const PAYMENT_TECHNOLOGIES = [
  'stripe',
  'adyen',
  'paypal',
  'braintree',
  'klarna',
  'mollie',
  'checkout.com',
  'worldpay',
  'square',
  'sumup',
  'gocardless',
];

const text = (value: any) => String(value ?? '').trim();

function observedTechnologyNames(organization: any): string[] {
  const collected: string[] = [];
  for (
    const item of Array.isArray(organization?.current_technologies)
      ? organization.current_technologies
      : []
  ) {
    const name = text((item as any)?.name ?? item);
    if (name) collected.push(name);
  }
  for (
    const name of Array.isArray(organization?.technology_names)
      ? organization.technology_names
      : []
  ) {
    const value = text(name);
    if (value) collected.push(value);
  }
  return [...new Set(collected)].slice(0, 100);
}

/** Deterministic bucketing of an OBSERVED head count — not an estimate. */
export function employeeRangeFromCount(count: any): string | null {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 10) return '1-10';
  if (value <= 50) return '11-50';
  if (value <= 200) return '51-200';
  if (value <= 500) return '201-500';
  if (value <= 1000) return '501-1000';
  if (value <= 5000) return '1001-5000';
  if (value <= 10000) return '5001-10000';
  return '10001+';
}

/**
 * Maps an Apollo organization payload into OutboundLead firmography fields.
 * Every field is conditional on Apollo having returned the source value.
 */
export function mapApolloOrganizationToFirmography(organization: any) {
  const fields: any = {};
  const technologies = observedTechnologyNames(organization);
  const employeeRange = employeeRangeFromCount(
    organization?.estimated_num_employees,
  );
  if (employeeRange) fields.employee_range = employeeRange;
  const revenuePrinted = text(
    organization?.annual_revenue_printed ||
      organization?.organization_revenue_printed,
  );
  if (revenuePrinted) fields.revenue_range = revenuePrinted;
  if (technologies.length) {
    fields.detected_technologies = technologies.slice(0, 50);
  }
  const lower = technologies.map((name) => name.toLowerCase());
  const platform = ECOMMERCE_PLATFORMS.find((candidate) =>
    lower.some((name) => name.includes(candidate))
  );
  if (platform) fields.ecommerce_platform = platform;
  const paymentStack = PAYMENT_TECHNOLOGIES.filter((candidate) =>
    lower.some((name) => name.includes(candidate))
  );
  if (paymentStack.length) fields.probable_payment_stack = paymentStack;
  return {
    fields,
    snapshot: {
      provider: 'apollo',
      endpoint: 'organizations/enrich',
      provider_organization_id: organization?.id || null,
      estimated_num_employees:
        Number.isFinite(Number(organization?.estimated_num_employees)) &&
          Number(organization?.estimated_num_employees) > 0
          ? Number(organization.estimated_num_employees)
          : null,
      annual_revenue_printed: revenuePrinted || null,
      technologies_observed: technologies.length,
      // Apollo does not return TPV; these fields stay empty by design.
      tpv_not_provided_by_provider: true,
    },
  };
}

export type CompanyEnrichmentRequest = (
  reservation: any,
  effectLabel: string,
  path: string,
  options: { method?: string; body?: any; query?: URLSearchParams },
) => Promise<any>;

/**
 * Runs firmography enrichment for the supplied leads. `request` is the
 * reservation-guarded Apollo caller owned by the agent entry; tests inject a
 * fake. Budget/idempotency semantics mirror the contact path: one
 * reservePaidOperation per lead, duplicate effects skip, settlement recorded.
 */
export async function runCompanyEnrichmentOperation(service: any, input: {
  leads: any[];
  discovery_run_id?: string | null;
  max_related_spend_minor?: unknown;
  request: CompanyEnrichmentRequest;
  reserve?: typeof reservePaidOperation;
  settle?: typeof settlePaidOperation;
}) {
  const reserve = input.reserve || reservePaidOperation;
  const settle = input.settle || settlePaidOperation;
  const at = () => new Date().toISOString();
  let enriched = 0, skipped = 0, failed = 0, providerCalls = 0;
  const details: any[] = [];
  for (const lead of input.leads) {
    const domain = normalizeDiscoveryDomain(lead?.company_domain);
    if (!domain) {
      skipped++;
      details.push({ lead_id: lead?.id, status: 'SKIPPED_NO_COMPANY_DOMAIN' });
      continue;
    }
    let reservation: any = null;
    try {
      reservation = await reserve(service, {
        event_key: `company-enrichment:apollo:${lead.id}`,
        category: 'enrichment',
        provider: 'apollo',
        source: 'leadEnrichmentAgent',
        related_entity_type: input.discovery_run_id
          ? 'DiscoveryExecutionRun'
          : 'OutboundLead',
        related_entity_id: input.discovery_run_id || lead.id,
        max_related_spend_minor: input.max_related_spend_minor,
        usage_json: {
          discovery_run_id: input.discovery_run_id || null,
          lead_id: lead.id,
          stage: 'SELECTIVE_COMPANY_ENRICHMENT',
          reason: 'Lead survived dedupe, exclusions and local pre-fit',
        },
      });
    } catch (error: any) {
      failed++;
      details.push({
        lead_id: lead.id,
        status: 'RESERVATION_FAILED',
        error: text(error?.code || error?.message).slice(0, 160),
      });
      continue;
    }
    if (reservation?.duplicate) {
      skipped++;
      details.push({
        lead_id: lead.id,
        status: 'SKIPPED_DUPLICATE_PAID_EFFECT',
      });
      continue;
    }
    try {
      providerCalls++;
      const payload = await input.request(
        reservation,
        `organization_enrich:${lead.id}`,
        '/organizations/enrich',
        { method: 'GET', query: new URLSearchParams({ domain }) },
      );
      const organization = payload?.organization || {};
      const mapped = mapApolloOrganizationToFirmography(organization);
      if (!Object.keys(mapped.fields).length) {
        skipped++;
        details.push({ lead_id: lead.id, status: 'NO_FIRMOGRAPHY_RETURNED' });
        await settle(service, reservation, {
          ok: true,
          usage_json: {
            endpoint: 'organizations/enrich',
            firmography_fields_written: 0,
          },
        });
        continue;
      }
      await service.entities.OutboundLead.update(lead.id, {
        ...mapped.fields,
        // Firmography moves lead → enriched, but "fully enriched" additionally
        // requires the later governed contact-last resolution to succeed
        // (which sets contact fields + last_enriched_at). Partial success is
        // therefore visible, never silently presented as complete.
        ...(text(lead.stage) === '' || text(lead.stage) === 'lead'
          ? { stage: 'enriched' }
          : {}),
        enrichment_json: {
          ...(lead.enrichment_json || {}),
          company_enrichment: { ...mapped.snapshot, enriched_at: at() },
        },
        external_refs_json: {
          ...(lead.external_refs_json || {}),
          apollo_organization_id: organization?.id ||
            lead?.external_refs_json?.apollo_organization_id || null,
        },
      });
      await settle(service, reservation, {
        ok: true,
        usage_json: {
          endpoint: 'organizations/enrich',
          firmography_fields_written: Object.keys(mapped.fields).length,
        },
      });
      enriched++;
      details.push({
        lead_id: lead.id,
        status: 'FIRMOGRAPHY_ENRICHED',
        fields: Object.keys(mapped.fields),
      });
    } catch (error: any) {
      failed++;
      details.push({
        lead_id: lead.id,
        status: 'PROVIDER_CALL_FAILED',
        error: text(error?.code || error?.message).slice(0, 160),
      });
      await settle(service, reservation, {
        ok: false,
        usage_json: {
          endpoint: 'organizations/enrich',
          error: text(error?.code || error?.message).slice(0, 160),
        },
      }).catch((settleError: any) =>
        safeBestEffort(settleError, {
          operation: 'companyEnrichment.settle_failed_effect',
          fallback: null,
          severity: 'critical',
        })
      );
    }
  }
  return {
    enriched,
    skipped,
    failed,
    provider_calls: providerCalls,
    details,
  };
}
