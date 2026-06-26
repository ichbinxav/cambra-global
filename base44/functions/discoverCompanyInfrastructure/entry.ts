import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M4 — discoverCompanyInfrastructure
 *
 * Scans a public website and detects infrastructure tools by looking for
 * known signals in HTML, script tags, meta tags and headers.
 *
 * Payload: { website_url: string, brand_id: string }
 * Returns: { ok: true, findings: [...], job_id } | { ok: false, error }
 *
 * SECURITY:
 * - Only fetches PUBLIC website data (no auth, no private APIs)
 * - Never stores full HTML — only matched signal substrings
 * - Per-brand findings; brand ownership enforced
 */

const ENGINE_VERSION = '1.0.0';

const SIGNALS = [
  // commerce_platform
  { tool: 'Shopify',     category: 'commerce_platform', pattern: /cdn\.shopify\.com|Shopify\.theme/i,                       method: 'script_tag', evidence_type: 'script_tag', score: 0.95 },
  { tool: 'WooCommerce', category: 'commerce_platform', pattern: /woocommerce/i,                                             method: 'script_or_body', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'Magento',     category: 'commerce_platform', pattern: /mage\/cookies|Magento_/i,                                  method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'BigCommerce', category: 'commerce_platform', pattern: /cdn\d*\.bigcommerce\.com/i,                                method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'PrestaShop',  category: 'commerce_platform', pattern: /prestashop/i,                                              method: 'meta_or_body', evidence_type: 'meta_tag', score: 0.70 },

  // payment_provider
  { tool: 'Stripe',      category: 'payment_provider',  pattern: /js\.stripe\.com/i,                                         method: 'script_tag', evidence_type: 'script_tag', score: 0.95 },
  { tool: 'PayPal',      category: 'payment_provider',  pattern: /paypal\.com\/sdk|paypalobjects\.com/i,                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Klarna',      category: 'payment_provider',  pattern: /klarna\.com/i,                                             method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'Adyen',       category: 'payment_provider',  pattern: /checkoutshopper-live\.adyen\.com|adyen\.com\/hpp/i,        method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Mollie',      category: 'payment_provider',  pattern: /mollie\.com/i,                                             method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },

  // marketing
  { tool: 'Klaviyo',     category: 'marketing',         pattern: /static\.klaviyo\.com|a\.klaviyo\.com/i,                    method: 'script_tag', evidence_type: 'script_tag', score: 0.95 },
  { tool: 'Mailchimp',   category: 'marketing',         pattern: /chimpstatic\.com|list-manage\.com/i,                       method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'Meta Pixel',  category: 'marketing',         pattern: /connect\.facebook\.net/i,                                  method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'TikTok Pixel',category: 'marketing',         pattern: /analytics\.tiktok\.com/i,                                  method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },

  // analytics
  { tool: 'Google Analytics', category: 'analytics',    pattern: /gtag\(|google-analytics\.com|googletagmanager\.com/i,      method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Hotjar',           category: 'analytics',    pattern: /static\.hotjar\.com/i,                                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Segment',          category: 'analytics',    pattern: /cdn\.segment\.com/i,                                       method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // support
  { tool: 'Gorgias',     category: 'support',           pattern: /config\.gorgias\.chat|gorgias\.io/i,                       method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Zendesk',     category: 'support',           pattern: /static\.zdassets\.com|zendesk\.com\/embeddable/i,          method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Intercom',    category: 'support',           pattern: /widget\.intercom\.io/i,                                    method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // shipping
  { tool: 'SendCloud',   category: 'shipping',          pattern: /sendcloud\.(com|sc)/i,                                     method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'Packlink',    category: 'shipping',          pattern: /packlink\.com/i,                                           method: 'script_tag', evidence_type: 'script_tag', score: 0.85 },
  { tool: 'DHL',         category: 'shipping',          pattern: /dhl\.com\/[a-z-]*\/shipping|dhl-widget/i,                  method: 'script_or_body', evidence_type: 'script_tag', score: 0.65 },

  // ────────────────────────────────────────────────────────────────────────
  // Extended detectors — added in vendor-intelligence pass.
  // Score convention: script_tag=0.90, meta_tag=0.70, body_text=0.50
  // ────────────────────────────────────────────────────────────────────────

  // payments (extended)
  { tool: 'Adyen',       category: 'payment_provider',  pattern: /adyen\.com|checkoutshopperapi\.adyen\.com/i,               method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'PayPal',      category: 'payment_provider',  pattern: /paypal\.com\/sdk|paypalobjects\.com/i,                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Mollie',      category: 'payment_provider',  pattern: /js\.mollie\.com/i,                                         method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'SumUp',       category: 'payment_provider',  pattern: /sumup\.com/i,                                              method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Zettle',      category: 'payment_provider',  pattern: /zettle\.com|izettle\.com/i,                                method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Lyra',        category: 'payment_provider',  pattern: /lyra\.com|payzen\.eu/i,                                    method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Monetico',    category: 'payment_provider',  pattern: /monetico-paiement\.fr/i,                                   method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // commerce_platform (extended)
  { tool: 'WooCommerce', category: 'commerce_platform', pattern: /woocommerce/i,                                             method: 'meta_or_body', evidence_type: 'meta_tag', score: 0.70 },
  { tool: 'PrestaShop',  category: 'commerce_platform', pattern: /prestashop/i,                                              method: 'meta_or_body', evidence_type: 'meta_tag', score: 0.70 },
  { tool: 'Magento',     category: 'commerce_platform', pattern: /magento[\/\.]|Magento_/i,                                  method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'BigCommerce', category: 'commerce_platform', pattern: /bigcommerce\.com/i,                                        method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // shipping (extended)
  { tool: 'Colissimo',     category: 'shipping',  pattern: /colissimo\.fr/i,                  method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Chronopost',    category: 'shipping',  pattern: /chronopost\.fr/i,                 method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Mondial Relay', category: 'shipping',  pattern: /mondialrelay/i,                   method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'DPD',           category: 'shipping',  pattern: /dpd\.com|dpd\.fr/i,               method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'GLS',           category: 'shipping',  pattern: /gls-group/i,                      method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'MRW',           category: 'shipping',  pattern: /mrw\.es/i,                        method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Byrd',          category: 'shipping',  pattern: /getbyrd\.com/i,                   method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Cubyn',         category: 'shipping',  pattern: /cubyn\.com/i,                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // marketing (extended)
  { tool: 'Mailchimp',  category: 'marketing', pattern: /chimpstatic\.com/i,                  method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Brevo',      category: 'marketing', pattern: /sibautomation\.com|brevo\.com/i,     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Google Ads', category: 'marketing', pattern: /googleadservices\.com/i,             method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Attentive',  category: 'marketing', pattern: /attentivemobile\.com/i,              method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Postscript', category: 'marketing', pattern: /postscript\.io/i,                    method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // support (extended)
  { tool: 'Zendesk',   category: 'support', pattern: /zdassets\.com/i,                        method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Freshdesk', category: 'support', pattern: /freshwidget\.com/i,                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Intercom',  category: 'support', pattern: /intercomcdn\.com/i,                     method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Re:amaze',  category: 'support', pattern: /reamaze\.com/i,                         method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // banking
  { tool: 'Qonto',    category: 'finance', pattern: /qonto\.com/i,                            method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Revolut',  category: 'finance', pattern: /revolut\.com/i,                          method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Wise',     category: 'finance', pattern: /wise\.com/i,                             method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Shine',    category: 'finance', pattern: /shine\.fr/i,                             method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'N26',      category: 'finance', pattern: /n26\.com/i,                              method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Spendesk', category: 'finance', pattern: /spendesk\.com/i,                         method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // hr
  { tool: 'Factorial', category: 'hr', pattern: /factorialhr\.com/i,                          method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Personio',  category: 'hr', pattern: /personio\.de|personio\.com/i,                method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
  { tool: 'Deel',      category: 'hr', pattern: /letsdeel\.com/i,                             method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },

  // telecom
  { tool: 'Aircall', category: 'other', pattern: /aircall\.io/i,                              method: 'script_tag', evidence_type: 'script_tag', score: 0.90 },
];

function normalizeUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).toString(); } catch { return null; }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { website_url, brand_id } = body;

    if (!brand_id) {
      return Response.json({ ok: false, error: 'Missing brand_id' }, { status: 400 });
    }
    const url = normalizeUrl(website_url);
    if (!url) {
      return Response.json({ ok: false, error: 'Invalid website_url' }, { status: 400 });
    }

    // Verify brand ownership (admins bypass)
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const domain = extractDomain(url);
    const startedAt = new Date().toISOString();

    // Create job
    const job = await base44.asServiceRole.entities.DiscoveryJob.create({
      brand_id,
      website_url: url,
      email_domain: domain,
      status: 'running',
      started_at: startedAt,
      engine_version: ENGINE_VERSION,
      findings_count: 0,
    });

    // Fetch public HTML — non-fatal on failure
    let html = '';
    let headers = {};
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'CAMBRA-Discovery/1.0 (+https://cambra.global)' },
        signal: AbortSignal.timeout(8000),
      });
      headers = Object.fromEntries(res.headers.entries());
      // Cap body at 512KB — we only need signal substrings, never full HTML
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      const cap = 512 * 1024;
      if (reader) {
        while (received < cap) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          received += value.byteLength;
        }
        try { reader.cancel(); } catch (_) { /* ignore */ }
      }
    } catch (fetchErr) {
      await base44.asServiceRole.entities.DiscoveryJob.update(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `Fetch failed: ${fetchErr.message}`,
      });
      return Response.json({ ok: false, error: `Could not fetch ${url}: ${fetchErr.message}`, job_id: job.id });
    }

    // Run signal detection — capture only short evidence substrings, never full HTML
    const findings = [];
    for (const sig of SIGNALS) {
      const m = html.match(sig.pattern);
      if (m) {
        const matched = String(m[0]).slice(0, 200);
        findings.push({
          discovery_job_id: job.id,
          brand_id,
          category: sig.category,
          provider_or_tool: sig.tool,
          confidence_score: sig.score,
          evidence_type: sig.evidence_type,
          evidence_value: matched,
          detection_method: sig.method,
          source_url: url,
          status: 'detected',
          created_at: new Date().toISOString(),
        });
      }
    }

    // Header-based signal: x-shopify-stage
    if (headers['x-shopify-stage'] || headers['x-shopid']) {
      if (!findings.some(f => f.provider_or_tool === 'Shopify')) {
        findings.push({
          discovery_job_id: job.id,
          brand_id,
          category: 'commerce_platform',
          provider_or_tool: 'Shopify',
          confidence_score: 0.95,
          evidence_type: 'header',
          evidence_value: 'x-shopify-stage / x-shopid header present',
          detection_method: 'response_header',
          source_url: url,
          status: 'detected',
          created_at: new Date().toISOString(),
        });
      }
    }

    // Persist findings (bulk)
    if (findings.length) {
      await base44.asServiceRole.entities.DiscoveryFinding.bulkCreate(findings);
    }

    // Upsert CompanyMemory for this brand
    const commercePlatform = findings.find(f => f.category === 'commerce_platform')?.provider_or_tool || null;
    const existing = await base44.asServiceRole.entities.CompanyMemory.filter({ brand_id }, '-created_date', 1).catch(() => []);
    const memoryPatch = {
      brand_id,
      website_url: url,
      email_domain: domain,
      latest_discovery_job_id: job.id,
      last_seen_at: new Date().toISOString(),
      ...(commercePlatform ? { commerce_platform_detected: commercePlatform } : {}),
    };
    if (existing.length) {
      await base44.asServiceRole.entities.CompanyMemory.update(existing[0].id, memoryPatch);
    } else {
      await base44.asServiceRole.entities.CompanyMemory.create(memoryPatch);
    }

    // Finalize job
    const finalStatus = findings.length > 0 ? 'completed' : 'partial';
    await base44.asServiceRole.entities.DiscoveryJob.update(job.id, {
      status: finalStatus,
      completed_at: new Date().toISOString(),
      findings_count: findings.length,
    });

    return Response.json({
      ok: true,
      job_id: job.id,
      findings: findings.map(f => ({
        category: f.category,
        provider_or_tool: f.provider_or_tool,
        confidence_score: f.confidence_score,
        evidence_type: f.evidence_type,
      })),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});