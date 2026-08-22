export function recoverPrivateRateTerms(rate: any, eligibilityStatus: unknown) {
  const termsVisible = eligibilityStatus === "eligible" &&
    rate?.confidential === false &&
    rate?.disclosure_mode === "TERMS_VISIBLE";
  return {
    terms_visible: termsVisible,
    negotiated_variable_rate_bps: termsVisible
      ? rate?.variable_rate_bps ?? null
      : null,
    negotiated_fixed_fee_minor: termsVisible
      ? rate?.fixed_fee_minor ?? null
      : null,
  };
}
