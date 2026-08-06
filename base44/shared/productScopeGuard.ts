// productScopeGuard — CAMBRA v61 (2026-08-06). Audit finding #4/#12.
//
// SERVER-SIDE product scope enforcement, derived EXCLUSIVELY from the
// generated policy artifact. featureScope.js governs the UI; this module
// governs the backend. Hiding a vertical in the UI is not enough: report
// generation, savings computation, billing, invoicing and activation must
// all refuse non-production verticals server-side.
//
// Pure module (no SDK, no I/O) — runs identically in Deno and vitest.

import { PRODUCT_SCOPE_POLICY, isProductionEnabled, isMerchantVisible } from './generated/productPolicy.ts';

export class ProductScopeError extends Error {
  code: string;
  vertical: string;
  constructor(vertical: string, kind: 'production' | 'merchant_visible') {
    super(`product_scope_blocked:${vertical}`);
    this.name = 'ProductScopeError';
    this.code = kind === 'production'
      ? `product_scope_blocked:${vertical}`
      : `product_scope_not_merchant_visible:${vertical}`;
    this.vertical = vertical;
  }
}

/** Verticals enabled for production economic effects (reports, billing, invoices). */
export function getProductionVerticals(): string[] {
  return Object.keys(PRODUCT_SCOPE_POLICY).filter((v) => isProductionEnabled(v));
}

/**
 * Throws ProductScopeError unless `vertical` is production-enabled in the
 * canonical policy. Callers in economic paths MUST call this before creating
 * any report, savings figure, billing rule or invoice.
 */
export function assertProductionEnabledVertical(vertical: unknown): void {
  const v = String(vertical || '');
  if (!v || !isProductionEnabled(v)) throw new ProductScopeError(v || 'unknown', 'production');
}

/** Throws unless the vertical may be shown to merchants. */
export function assertMerchantVisibleVertical(vertical: unknown): void {
  const v = String(vertical || '');
  if (!v || !isMerchantVisible(v)) throw new ProductScopeError(v || 'unknown', 'merchant_visible');
}