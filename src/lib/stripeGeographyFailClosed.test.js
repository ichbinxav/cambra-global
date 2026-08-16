import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  classifyStripeCardGeography,
  normalizeStripeCountry,
  STRIPE_COUNTRY_UNKNOWN,
  stripeCountryToRateRegion,
} from '../../base44/shared/stripeGeography.ts';

const read = (path) =>
  fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const charge = (country) => ({
  status: 'succeeded',
  payment_method_details: { card: { country } },
});

describe('Stripe geography fail-closed authority', () => {
  it('keeps absent or malformed account countries UNKNOWN', () => {
    for (const value of [undefined, null, '', 'XX', 'ZZ', 'UNKNOWN']) {
      expect(normalizeStripeCountry(value), String(value)).toBe(
        STRIPE_COUNTRY_UNKNOWN,
      );
      expect(stripeCountryToRateRegion(value), String(value)).toBeNull();
    }
  });

  it('preserves explicit FR and maps demonstrated countries only', () => {
    expect(normalizeStripeCountry(' fr ')).toBe('FR');
    expect(normalizeStripeCountry('France')).toBe('FR');
    expect(stripeCountryToRateRegion('FR')).toBe('EU');
    expect(stripeCountryToRateRegion('GB')).toBe('UK');
    expect(stripeCountryToRateRegion('US')).toBe('US');
    expect(stripeCountryToRateRegion('CA')).toBe('RoW');
  });

  it('never labels cards domestic or international when account country is unknown', () => {
    expect(classifyStripeCardGeography([
      charge('FR'),
      charge('ES'),
      charge(null),
    ], null)).toEqual({
      account_country: 'UNKNOWN',
      country_status: 'UNKNOWN',
      geography_inference_status: 'BLOCKED_COUNTRY_UNKNOWN',
      identified: 0,
      international_charges: 0,
      domestic_charges: 0,
      unclassified_charges: 2,
      international_share_pct: null,
    });
  });

  it('classifies geography when FR is explicit evidence', () => {
    expect(classifyStripeCardGeography([
      charge('FR'),
      charge('ES'),
      charge('fr'),
    ], 'FR')).toMatchObject({
      account_country: 'FR',
      country_status: 'KNOWN',
      geography_inference_status: 'MEASURED',
      identified: 3,
      international_charges: 1,
      domestic_charges: 2,
      international_share_pct: 33.33,
    });
  });

  it('removes invented FR/US fallbacks from both Stripe runtime paths', () => {
    const verified = read('base44/functions/computeStripeVerifiedGap/entry.ts');
    const sync = read('base44/functions/stripeDataSync/entry.ts');
    expect(verified).not.toMatch(/metadata_json\?\.country\s*\|\|\s*['"](?:FR|US)['"]/);
    expect(sync).not.toMatch(/conn\.country\s*\|\|\s*['"]FR['"]/);
    expect(verified).toContain("error: 'stripe_account_country_required'");
    expect(verified).toContain("blockers: ['STRIPE_ACCOUNT_COUNTRY_UNKNOWN']");
    expect(verified).toContain("brand?.is_demo === true");
    expect(sync).toContain('classifyStripeCardGeography(charges, acctCountry)');
    expect(sync).toContain("geography_inference_status: geography.geography_inference_status");
  });
});
