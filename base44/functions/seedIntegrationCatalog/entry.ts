import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * M5 — seedIntegrationCatalog
 *
 * Idempotent admin-only seeder for the IntegrationCatalog.
 * Upserts by integration_id. 60 entries covering Payments, Commerce, Banking,
 * Shipping, Marketing, Finance, Support, HR, Telecom, Analytics.
 */

const CATALOG = [
  // ── PSP · Online payments (channel: "online") ─────────────────
  // 1.2 (2026-07-14) — split payments into online PSP + in-store TPV via the
  // new `channel` field. Top-10 FR per channel. Stripe is the only `live`
  // connector; everything else is `coming_soon`. Idempotent upsert by
  // integration_id (see loop below) — safe to re-run.
  { integration_id: "stripe",           name: "Stripe",           category: "payments",  channel: "online",   auth_type: "oauth",   depth: "deep",     status: "live",        priority: 1,  value_unlock: "Real payment fees, effective rate, disputes" },
  { integration_id: "paypal",           name: "PayPal",           category: "payments",  channel: "online",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 2,  value_unlock: "Checkout volumes and fees" },
  { integration_id: "mollie",           name: "Mollie",           category: "payments",  channel: "online",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "European payment processing & fees" },
  { integration_id: "payplug",          name: "Payplug",          category: "payments",  channel: "online",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 4,  value_unlock: "French online payment processing & fees" },
  { integration_id: "adyen",            name: "Adyen",            category: "payments",  channel: "online",   auth_type: "api_key", depth: "deep",     status: "coming_soon", priority: 5,  value_unlock: "Enterprise interchange++ rates and disputes" },
  { integration_id: "checkout_com",     name: "Checkout.com",     category: "payments",  channel: "online",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 6,  value_unlock: "Enterprise card acquiring fees" },
  { integration_id: "stancer",          name: "Stancer",          category: "payments",  channel: "online",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 7,  value_unlock: "French online payment processing & fees" },
  { integration_id: "lyra",             name: "Lyra",             category: "payments",  channel: "online",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 8,  value_unlock: "French online payment gateway (PayZen) fees" },
  { integration_id: "worldline",        name: "Worldline",        category: "payments",  channel: "online",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 9,  value_unlock: "Worldline / Payline online acquiring fees" },
  { integration_id: "klarna",           name: "Klarna",           category: "payments",  channel: "online",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 10, value_unlock: "Buy-now-pay-later volume and fees" },
  { integration_id: "shopify_payments", name: "Shopify Payments", category: "payments",  channel: "online",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 11, value_unlock: "Shopify-managed payment fees" },

  // ── TPV · In-store terminals (channel: "in_store") ────────────
  { integration_id: "sumup",            name: "SumUp",            category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 11, value_unlock: "In-store TPV terminal data and fees" },
  { integration_id: "zettle",           name: "Zettle",           category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 12, value_unlock: "In-store card terminal data (PayPal)" },
  { integration_id: "smile_and_pay",    name: "Smile & Pay",      category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 13, value_unlock: "French in-store card terminal fees" },
  { integration_id: "yavin",            name: "Yavin",            category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 14, value_unlock: "French smart TPV terminal fees" },
  { integration_id: "worldline_terminal", name: "Worldline (terminals)", category: "payments", channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 15, value_unlock: "Worldline in-store terminal rental and fees" },
  { integration_id: "mypos",            name: "myPOS",            category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 16, value_unlock: "In-store card terminal data and fees" },
  { integration_id: "nepting",          name: "Nepting",          category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 17, value_unlock: "French payment terminal processing fees" },
  { integration_id: "stripe_terminal",  name: "Stripe Terminal",  category: "payments",  channel: "in_store", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 18, value_unlock: "In-store TPV via Stripe Terminal" },
  { integration_id: "ingenico",         name: "Ingenico",         category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 19, value_unlock: "Ingenico terminal rental and acquiring fees" },
  { integration_id: "verifone",         name: "Verifone",         category: "payments",  channel: "in_store", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 20, value_unlock: "Verifone terminal rental and acquiring fees" },

  // ── Commerce (6) ──────────────────────────────────────────────
  { integration_id: "shopify",          name: "Shopify",          category: "commerce",  auth_type: "oauth",   depth: "deep",     status: "coming_soon", priority: 1,  value_unlock: "Real GMV, orders, AOV, country mix, currency" },
  { integration_id: "woocommerce",      name: "WooCommerce",      category: "commerce",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 2,  value_unlock: "WordPress store revenue and orders" },
  { integration_id: "prestashop",       name: "PrestaShop",       category: "commerce",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Self-hosted store orders and revenue" },
  { integration_id: "magento",          name: "Magento",          category: "commerce",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 4,  value_unlock: "Adobe Commerce GMV and orders" },
  { integration_id: "bigcommerce",      name: "BigCommerce",      category: "commerce",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 5,  value_unlock: "BigCommerce store revenue and orders" },
  { integration_id: "wix_ecom",         name: "Wix eCommerce",    category: "commerce",  auth_type: "oauth",   depth: "standard", status: "planned",     priority: 6,  value_unlock: "Wix store revenue and product mix" },
  { integration_id: "wizishop",         name: "WiziShop",         category: "commerce",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 7,  value_unlock: "French SMB e-commerce platform revenue and orders" },

  // ── Banking (8) ──────────────────────────────────────────────
  { integration_id: "qonto",            name: "Qonto",            category: "banking",   auth_type: "oauth",   depth: "deep",     status: "coming_soon", priority: 1,  value_unlock: "Business banking fees and FX spreads" },
  { integration_id: "revolut_business", name: "Revolut Business", category: "banking",   auth_type: "oauth",   depth: "deep",     status: "coming_soon", priority: 2,  value_unlock: "Multi-currency banking and FX data" },
  { integration_id: "wise",             name: "Wise Business",    category: "banking",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Cross-border payment fees and FX" },
  { integration_id: "shine",            name: "Shine",            category: "banking",   auth_type: "oauth",   depth: "standard", status: "planned",     priority: 4,  value_unlock: "French SME banking fees" },
  { integration_id: "n26_business",     name: "N26 Business",     category: "banking",   auth_type: "oauth",   depth: "standard", status: "planned",     priority: 5,  value_unlock: "German SME banking fees" },
  { integration_id: "spendesk",         name: "Spendesk",         category: "banking",   auth_type: "oauth",   depth: "standard", status: "planned",     priority: 6,  value_unlock: "Spend management and card fees" },
  { integration_id: "memo_bank",        name: "Memo Bank",        category: "banking",   auth_type: "oauth",   depth: "standard", status: "planned",     priority: 7,  value_unlock: "French business banking data" },
  { integration_id: "swan",             name: "Swan",             category: "banking",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 8,  value_unlock: "Embedded banking and IBAN data" },
  { integration_id: "bnp_paribas_pro",     name: "BNP Paribas Pro",         category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 9,  value_unlock: "French traditional bank fees and account data" },
  { integration_id: "credit_agricole_pro", name: "Crédit Agricole Pro",     category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 10, value_unlock: "French traditional bank fees and account data" },
  { integration_id: "societe_generale_pro",name: "Société Générale Pro",    category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 11, value_unlock: "French traditional bank fees and account data" },
  { integration_id: "boursorama_pro",      name: "Boursorama Pro",          category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 12, value_unlock: "French online bank fees and account data" },
  { integration_id: "santander_pro",       name: "Santander Empresas",      category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 13, value_unlock: "Spanish traditional bank fees and account data" },
  { integration_id: "bbva_pro",            name: "BBVA Empresas",           category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 14, value_unlock: "Spanish traditional bank fees and account data" },
  { integration_id: "caixabank_pro",       name: "CaixaBank Negocios",      category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 15, value_unlock: "Spanish traditional bank fees and account data" },
  { integration_id: "sabadell_pro",        name: "Banco Sabadell Empresas", category: "banking", auth_type: "api_key", depth: "standard", status: "planned", priority: 16, value_unlock: "Spanish traditional bank fees and account data" },

  // ── Shipping (12) ─────────────────────────────────────────────
  { integration_id: "sendcloud",        name: "Sendcloud",        category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 1,  value_unlock: "Real shipping costs, carriers, destinations" },
  { integration_id: "shipstation",      name: "ShipStation",      category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 2,  value_unlock: "Shipping costs and carrier performance" },
  { integration_id: "packlink",         name: "Packlink",         category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Multi-carrier shipping rates" },
  { integration_id: "dhl",              name: "DHL",              category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 4,  value_unlock: "DHL carrier rates and shipment data" },
  { integration_id: "fedex",            name: "FedEx",            category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 5,  value_unlock: "FedEx express and freight rates" },
  { integration_id: "ups",              name: "UPS",              category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 6,  value_unlock: "UPS shipment data and rates" },
  { integration_id: "colissimo",        name: "Colissimo",        category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 7,  value_unlock: "La Poste / Colissimo shipping rates" },
  { integration_id: "chronopost",       name: "Chronopost",       category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 8,  value_unlock: "Express French shipping rates" },
  { integration_id: "mondial_relay",    name: "Mondial Relay",    category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 9,  value_unlock: "Pickup-point shipping rates" },
  { integration_id: "dpd",              name: "DPD",              category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 10, value_unlock: "DPD European parcel rates" },
  { integration_id: "byrd",             name: "Byrd",             category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 11, value_unlock: "European 3PL fulfillment fees" },
  { integration_id: "cubyn",            name: "Cubyn",            category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 12, value_unlock: "French 3PL fulfillment fees" },
  { integration_id: "seur",             name: "SEUR",             category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 13, value_unlock: "Spanish parcel carrier rates and tracking" },
  { integration_id: "correos_express",  name: "Correos Express",  category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 14, value_unlock: "Spanish national carrier rates" },
  { integration_id: "gls_spain",        name: "GLS Spain",        category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 15, value_unlock: "Spanish parcel rates and tracking" },
  { integration_id: "gls_france",       name: "GLS France",       category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 16, value_unlock: "French parcel rates and tracking" },
  { integration_id: "relais_colis",     name: "Relais Colis",     category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 17, value_unlock: "French pickup-point shipping rates" },
  { integration_id: "shippeo",          name: "Shippeo",          category: "shipping",  auth_type: "api_key", depth: "standard", status: "planned",     priority: 18, value_unlock: "Real-time shipment visibility platform" },

  // ── Marketing (8) ─────────────────────────────────────────────
  { integration_id: "klaviyo",          name: "Klaviyo",          category: "marketing", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 1,  value_unlock: "Email marketing spend and contact tier" },
  { integration_id: "mailchimp",        name: "Mailchimp",        category: "marketing", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 2,  value_unlock: "Email list size and plan spend" },
  { integration_id: "brevo",            name: "Brevo",            category: "marketing", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Email + SMS marketing spend" },
  { integration_id: "attentive",        name: "Attentive",        category: "marketing", auth_type: "api_key", depth: "standard", status: "planned",     priority: 4,  value_unlock: "SMS marketing spend" },
  { integration_id: "postscript",       name: "Postscript",       category: "marketing", auth_type: "api_key", depth: "standard", status: "planned",     priority: 5,  value_unlock: "SMS marketing spend (Shopify)" },
  { integration_id: "meta_ads",         name: "Meta Ads",         category: "marketing", auth_type: "oauth",   depth: "deep",     status: "planned",     priority: 6,  value_unlock: "Facebook/Instagram ad spend & ROAS" },
  { integration_id: "google_ads",       name: "Google Ads",       category: "marketing", auth_type: "oauth",   depth: "deep",     status: "planned",     priority: 7,  value_unlock: "Google Ads spend & ROAS" },
  { integration_id: "tiktok_ads",       name: "TikTok Ads",       category: "marketing", auth_type: "oauth",   depth: "standard", status: "planned",     priority: 8,  value_unlock: "TikTok Ads spend & performance" },
  { integration_id: "mailjet",          name: "Mailjet",          category: "marketing", auth_type: "api_key", depth: "standard", status: "planned",     priority: 11, value_unlock: "Transactional + marketing email spend" },
  { integration_id: "splio",            name: "Splio",            category: "marketing", auth_type: "api_key", depth: "standard", status: "planned",     priority: 12, value_unlock: "French CRM and loyalty marketing spend" },

  // ── Finance (6) ───────────────────────────────────────────────
  { integration_id: "google_drive",     name: "Google Drive",     category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 1,  value_unlock: "Find invoices and statements automatically" },
  { integration_id: "gmail",            name: "Gmail",            category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 2,  value_unlock: "Find provider invoices in your inbox" },
  { integration_id: "xero",             name: "Xero",             category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Recurring costs, SaaS spend, accounting evidence" },
  { integration_id: "pennylane",        name: "Pennylane",        category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 4,  value_unlock: "Recurring costs and accounting evidence" },
  { integration_id: "quickbooks",       name: "QuickBooks",       category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 5,  value_unlock: "Accounting and recurring cost evidence" },
  { integration_id: "sellsy",           name: "Sellsy",           category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 6,  value_unlock: "French SME billing and accounting" },
  { integration_id: "tipalti",          name: "Tipalti",          category: "finance",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 7,  value_unlock: "AP automation and supplier payment fees" },

  // ── Accounting software — SME (FR/ES/EU) ──────────────────────
  { integration_id: "sage",             name: "Sage",                  category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 8,  value_unlock: "General ledger, recurring vendor costs, P&L evidence" },
  { integration_id: "cegid",            name: "Cegid Loop",            category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 9,  value_unlock: "French SME accounting ledger and vendor spend" },
  { integration_id: "ebp",              name: "EBP",                   category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 10, value_unlock: "French accounting and vendor invoice data" },
  { integration_id: "ciel",             name: "Ciel Compta",           category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 11, value_unlock: "French SME accounting ledger" },
  { integration_id: "indy",             name: "Indy",                  category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 12, value_unlock: "French freelance/SME accounting and tax data" },
  { integration_id: "tiime",            name: "Tiime",                 category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 13, value_unlock: "French accounting + receipts + expert link" },
  { integration_id: "dougs",            name: "Dougs",                 category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 14, value_unlock: "French online accounting and vendor spend" },
  { integration_id: "abby",             name: "Abby",                  category: "finance", auth_type: "oauth",   depth: "standard", status: "planned",     priority: 15, value_unlock: "French micro-entreprise accounting" },
  { integration_id: "freebe",           name: "Freebe",                category: "finance", auth_type: "oauth",   depth: "standard", status: "planned",     priority: 16, value_unlock: "French freelance billing and accounting" },
  { integration_id: "holded",           name: "Holded",                category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 17, value_unlock: "Spanish SME accounting, invoicing and vendor spend" },
  { integration_id: "quipu",            name: "Quipu",                 category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 18, value_unlock: "Spanish SME accounting and invoicing data" },
  { integration_id: "contasimple",      name: "Contasimple",           category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 19, value_unlock: "Spanish freelance/SME accounting" },
  { integration_id: "anfix",            name: "Anfix",                 category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 20, value_unlock: "Spanish online accounting platform" },
  { integration_id: "billin",           name: "Billin",                category: "finance", auth_type: "oauth",   depth: "standard", status: "planned",     priority: 21, value_unlock: "Spanish invoicing and accounting data" },
  { integration_id: "facturadirecta",   name: "FacturaDirecta",        category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 22, value_unlock: "Spanish invoicing and accounting" },
  { integration_id: "a3_wolters_kluwer",name: "a3 (Wolters Kluwer)",   category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 23, value_unlock: "Spanish asesoría-grade accounting suite" },
  { integration_id: "sage_contaplus",   name: "Sage ContaPlus",        category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 24, value_unlock: "Spanish SME accounting ledger" },
  { integration_id: "datev",            name: "DATEV",                 category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 25, value_unlock: "German Steuerberater-grade accounting data" },
  { integration_id: "lexoffice",        name: "Lexoffice",             category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 26, value_unlock: "German SME accounting and vendor spend" },
  { integration_id: "fattureincloud",   name: "Fatture in Cloud",      category: "finance", auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 27, value_unlock: "Italian SME e-invoicing and accounting" },

  // ── Expert-comptable & asesoría portals ───────────────────────
  { integration_id: "expert_comptable_portal", name: "Expert-comptable portal", category: "finance", auth_type: "manual",  depth: "standard", status: "coming_soon", priority: 28, value_unlock: "Connect your expert-comptable to share P&L, vendor invoices and contracts" },
  { integration_id: "asesoria_digital",        name: "Asesoría digital (ES)",   category: "finance", auth_type: "manual",  depth: "standard", status: "coming_soon", priority: 29, value_unlock: "Link your asesoría to share accounting evidence and recurring vendor spend" },
  { integration_id: "fec_upload",              name: "FEC file upload (FR)",    category: "finance", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 30, value_unlock: "One-shot upload of your FEC to extract vendor spend and recurring costs" },
  { integration_id: "modelo_347_upload",       name: "Modelo 347 upload (ES)",  category: "finance", auth_type: "api_key", depth: "standard", status: "planned",     priority: 31, value_unlock: "Extract supplier spend from your annual 347 declaration" },

  // ── Support (6) ───────────────────────────────────────────────
  { integration_id: "gorgias",          name: "Gorgias",          category: "support",   auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 1,  value_unlock: "Support tooling cost benchmark" },
  { integration_id: "zendesk",          name: "Zendesk",          category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 2,  value_unlock: "Support seat cost and volume" },
  { integration_id: "freshdesk",        name: "Freshdesk",        category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 3,  value_unlock: "Support tooling spend" },
  { integration_id: "intercom",         name: "Intercom",         category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 4,  value_unlock: "Support and messaging spend" },
  { integration_id: "reamaze",          name: "Re:amaze",         category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 5,  value_unlock: "Multi-channel support spend" },
  { integration_id: "tidio",            name: "Tidio",            category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 6,  value_unlock: "Live chat and bot spend" },

  // ── HR (5) ────────────────────────────────────────────────────
  { integration_id: "factorial",        name: "Factorial",        category: "hr",        auth_type: "oauth",   depth: "standard", status: "planned",     priority: 1,  value_unlock: "HRIS spend per employee benchmark" },
  { integration_id: "personio",         name: "Personio",         category: "hr",        auth_type: "oauth",   depth: "standard", status: "planned",     priority: 2,  value_unlock: "HRIS + payroll spend per employee" },
  { integration_id: "deel",             name: "Deel",             category: "hr",        auth_type: "oauth",   depth: "standard", status: "planned",     priority: 3,  value_unlock: "Global payroll and contractor fees" },
  { integration_id: "payfit",           name: "PayFit",           category: "hr",        auth_type: "oauth",   depth: "standard", status: "planned",     priority: 4,  value_unlock: "French/EU payroll fees" },
  { integration_id: "lucca",            name: "Lucca",            category: "hr",        auth_type: "oauth",   depth: "standard", status: "planned",     priority: 5,  value_unlock: "HR suite spend per employee" },

  // ── Telecom (3) ───────────────────────────────────────────────
  { integration_id: "aircall",          name: "Aircall",          category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 1,  value_unlock: "Cloud phone seat cost and usage" },
  { integration_id: "ringover",         name: "Ringover",         category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 2,  value_unlock: "Cloud telephony spend" },
  { integration_id: "dialpad",          name: "Dialpad",          category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 3,  value_unlock: "Voice + messaging spend" },
  { integration_id: "orange_pro",       name: "Orange Pro",       category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 4,  value_unlock: "French business mobile and internet fees" },
  { integration_id: "movistar_empresas",name: "Movistar Empresas",category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 5,  value_unlock: "Spanish business mobile and internet fees" },
  { integration_id: "ovh_telecom",      name: "OVH Telecom",      category: "telecom",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 6,  value_unlock: "French cloud telephony and internet spend" },

  // ── Analytics (2) — bucketed under marketing in UI ────────────
  { integration_id: "google_analytics", name: "Google Analytics", category: "marketing", auth_type: "oauth",   depth: "standard", status: "planned",     priority: 9,  value_unlock: "Traffic, conversion and channel mix data" },
  { integration_id: "segment",          name: "Segment",          category: "marketing", auth_type: "api_key", depth: "standard", status: "planned",     priority: 10, value_unlock: "Customer data infrastructure spend" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    let seeded = 0;
    let created = 0;
    let updated = 0;
    for (const entry of CATALOG) {
      const existing = await base44.asServiceRole.entities.IntegrationCatalog
        .filter({ integration_id: entry.integration_id }, '-created_date', 1)
        .catch(() => []);
      if (existing.length) {
        await base44.asServiceRole.entities.IntegrationCatalog.update(existing[0].id, entry);
        updated++;
      } else {
        await base44.asServiceRole.entities.IntegrationCatalog.create(entry);
        created++;
      }
      seeded++;
    }

    return Response.json({ ok: true, seeded, created, updated, total: CATALOG.length });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});