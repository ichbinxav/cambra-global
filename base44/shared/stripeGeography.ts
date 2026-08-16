export const STRIPE_COUNTRY_UNKNOWN = 'UNKNOWN' as const;

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
]);

export function normalizeStripeCountry(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  // Legacy/demo Brand rows may contain the explicit country name rather than
  // ISO-2. This is evidence supplied by the row, not a default.
  if (normalized === 'FRANCE') return 'FR';
  return /^[A-Z]{2}$/.test(normalized) && normalized !== 'XX' && normalized !== 'ZZ'
    ? normalized
    : STRIPE_COUNTRY_UNKNOWN;
}

export function stripeCountryToRateRegion(
  country: unknown,
): 'EU' | 'UK' | 'US' | 'RoW' | null {
  const normalized = normalizeStripeCountry(country);
  if (normalized === STRIPE_COUNTRY_UNKNOWN) return null;
  if (EU_COUNTRIES.has(normalized)) return 'EU';
  if (normalized === 'GB') return 'UK';
  if (normalized === 'US') return 'US';
  return 'RoW';
}

export function classifyStripeCardGeography(
  charges: any[] = [],
  accountCountry: unknown,
) {
  const country = normalizeStripeCountry(accountCountry);
  const successfulWithCountry = charges.filter((charge: any) =>
    charge?.status === 'succeeded' &&
    normalizeStripeCountry(charge?.payment_method_details?.card?.country) !==
      STRIPE_COUNTRY_UNKNOWN
  );
  if (country === STRIPE_COUNTRY_UNKNOWN) {
    return {
      account_country: STRIPE_COUNTRY_UNKNOWN,
      country_status: 'UNKNOWN' as const,
      geography_inference_status: 'BLOCKED_COUNTRY_UNKNOWN' as const,
      identified: 0,
      international_charges: 0,
      domestic_charges: 0,
      unclassified_charges: successfulWithCountry.length,
      international_share_pct: null,
    };
  }

  let internationalCharges = 0;
  let domesticCharges = 0;
  for (const charge of successfulWithCountry) {
    const cardCountry = normalizeStripeCountry(
      charge?.payment_method_details?.card?.country,
    );
    if (cardCountry === country) domesticCharges += 1;
    else internationalCharges += 1;
  }
  const identified = internationalCharges + domesticCharges;
  return {
    account_country: country,
    country_status: 'KNOWN' as const,
    geography_inference_status: 'MEASURED' as const,
    identified,
    international_charges: internationalCharges,
    domestic_charges: domesticCharges,
    unclassified_charges: 0,
    international_share_pct: identified > 0
      ? Math.round((internationalCharges / identified) * 10000) / 100
      : null,
  };
}
