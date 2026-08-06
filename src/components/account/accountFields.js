// accountFields — Checkpoint H (2026-08-06).
//
// The /Account form field definitions, extracted from the page so the labels and
// placeholders can be translated in one place instead of sitting as English
// literals inside two inline arrays in the JSX.
//
// `field` is the STORED entity property and is never localized — it is what the
// update call writes. Only `labelKey` / `placeholderKey` are translated.
//
// Numeric placeholders ("2", "40", "15000") stay as raw sample values: they are
// figures, not words, and are identical in all three languages.

/** Brand section — writes to the Brand entity. */
export const BRAND_FIELDS = [
  { field: "name",    labelKey: "acc_brand_name", placeholderKey: "acc_brand_name_ph" },
  { field: "website", labelKey: "acc_website",    placeholder: "https://" },
  { field: "country", labelKey: "acc_country",    placeholderKey: "acc_country_ph" },
];

/** In-store payments section — writes to the PaymentsProfile entity. */
export const PAYMENTS_PROFILE_FIELDS = [
  { field: "tpe_provider",              labelKey: "acc_tpe_provider",    placeholderKey: "acc_tpe_provider_ph" },
  { field: "terminal_count",            labelKey: "acc_terminal_count",  placeholder: "2" },
  { field: "monthly_terminal_rental",   labelKey: "acc_terminal_rental", placeholder: "40" },
  { field: "fixed_banking_fees",        labelKey: "acc_banking_fees",    placeholder: "15" },
  { field: "in_store_gmv",              labelKey: "acc_instore_gmv",     placeholder: "15000" },
  { field: "in_store_avg_ticket",       labelKey: "acc_avg_ticket",      placeholder: "45" },
  { field: "tpe_transaction_fee_pct",   labelKey: "acc_tx_fee_pct",      placeholder: "1.2" },
  { field: "contract_duration_months",  labelKey: "acc_contract_months", placeholder: "24" },
  { field: "renewal_date",              labelKey: "acc_renewal_date",    placeholder: "2026-12-31" },
];

/** Resolves a field's placeholder: translated when it is prose, raw when numeric. */
export const placeholderFor = (t, f) => (f.placeholderKey ? t(f.placeholderKey) : f.placeholder || "");