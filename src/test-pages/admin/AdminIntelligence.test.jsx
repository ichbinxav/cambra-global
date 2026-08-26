// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

globalThis.React = React;

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  language: { lang: "en", locale: "en-GB" },
}));

vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/i18n.jsx", () => ({ useTranslation: () => mocks.language }));

import AdminIntelligence, { INTELLIGENCE_COPY } from "../../pages/admin/AdminIntelligence.jsx";

const emptySnapshot = {
  ok: true,
  generated_at: null,
  metrics: {
    providers_tracked: null,
    pricing_records: 0,
    official_verified_pct: 0,
    evidence: null,
    knowledge_claims: null,
    open_conflicts: null,
    outcomes: null,
    high_value_gaps: null,
    quarantined_or_scope_ambiguous: 2,
  },
  pricing: [],
  conflicts: [],
  moat: [],
  gaps: [],
  recent_outcomes: [],
};

afterEach(() => {
  cleanup();
  mocks.invoke.mockReset();
  mocks.language.lang = "en";
  mocks.language.locale = "en-GB";
});

describe("AdminIntelligence truth boundary", () => {
  it("keeps EN, FR and ES truth-copy dictionaries in exact key parity", () => {
    const englishKeys = Object.keys(INTELLIGENCE_COPY.en).sort();
    expect(Object.keys(INTELLIGENCE_COPY.fr).sort()).toEqual(englishKeys);
    expect(Object.keys(INTELLIGENCE_COPY.es).sort()).toEqual(englishKeys);
  });

  it("keeps missing values UNKNOWN and does not turn an empty response into proof of absence", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: emptySnapshot });
    render(<AdminIntelligence/>);

    expect(await screen.findByText("Evidence boundary · advisory only")).toBeTruthy();
    expect(screen.getByText("UNKNOWN — no live, trained or calibrated model is asserted here")).toBeTruthy();
    expect(screen.getAllByText("UNKNOWN").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText(/No unresolved conflict row was returned\. Absence is not proven/i)).toBeTruthy();
    expect(screen.getByText(/No pricing row was returned\. State remains UNKNOWN/i)).toBeTruthy();
    expect(screen.queryByText("No open conflicts.")).toBeNull();
    expect(screen.queryByText(/negative outcomes stay in the dataset/i)).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledWith("getIntelligenceCommandCenter", {});
  });

  it("labels stored scores and outcomes as advisory, uncalibrated and not training data", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true,
      generated_at: "2026-08-13T08:30:00.000Z",
      metrics: {
        providers_tracked: 1,
        pricing_records: 1,
        official_verified_pct: 100,
        evidence: 4,
        knowledge_claims: 3,
        open_conflicts: 0,
        outcomes: 1,
        high_value_gaps: 1,
      },
      pricing: [{
        id: "price-1",
        provider_slug: "provider-a",
        country: "FR",
        channel: "online",
        variable_rate_bps: 0,
        truth_level: "verified_official",
        knowledge_state: "active",
        observed_at: "2026-08-12T08:00:00.000Z",
      }],
      conflicts: [],
      moat: [{ id: "metric-1", provider_slug: "provider-a", country: null, sample_size: 12, freshness: 0.8, confidence: 0.72, moat_score: 55 }],
      gaps: [{ id: "gap-1", provider_slug: "provider-a", country: "FR", information_value: 40, recommended_action: "Review approved evidence sources" }],
      recent_outcomes: [{ id: "outcome-1", operation_type: "recover", expected_savings: null, realized_savings: 0, variance: null, currency: "EUR", success: false }],
    } });

    render(<AdminIntelligence/>);

    expect(await screen.findByText("Strategic evidence index · advisory")).toBeTruthy();
    expect(screen.getByText(/uncalibrated input 72%/i)).toBeTruthy();
    expect(screen.getByText("Outcome observations · not a training dataset")).toBeTruthy();
    expect(screen.getByText("Knowledge gaps · advisory priorities")).toBeTruthy();
    expect(screen.getByText("Recommendation only")).toBeTruthy();
    expect(screen.getByText("non-success flag")).toBeTruthy();
    expect(screen.getByText("0 bps")).toBeTruthy();
    expect(screen.getByText("0 EUR")).toBeTruthy();
    expect(screen.getAllByText("UNKNOWN").length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces unavailable or capped source reads instead of presenting healthy zeroes", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ...emptySnapshot,
      degraded: true,
      source_health: {
        pricing: { status: "PARTIAL_LIMIT_REACHED", complete: false, returned_rows: 1000, limit: 1000 },
        outcomes: { status: "UNAVAILABLE", complete: false, returned_rows: 0, limit: 1000 },
      },
    } });
    render(<AdminIntelligence/>);
    expect(await screen.findByText("Source-read health")).toBeTruthy();
    expect(screen.getByText(/affected counts remain UNKNOWN/i)).toBeTruthy();
    expect(screen.getByText(/pricing · PARTIAL_LIMIT_REACHED/i)).toBeTruthy();
    expect(screen.getByText(/outcomes · UNAVAILABLE/i)).toBeTruthy();
  });

  it("uses the existing Admin language context for Spanish truth copy", async () => {
    mocks.language.lang = "es";
    mocks.language.locale = "es-ES";
    mocks.invoke.mockResolvedValueOnce({ data: emptySnapshot });

    render(<AdminIntelligence/>);

    expect(await screen.findByRole("heading", { name: "Inteligencia" })).toBeTruthy();
    expect(screen.getByText("Límite de evidencia · solo consultivo")).toBeTruthy();
    expect(screen.getByText("Observaciones de outcomes · no es un dataset de entrenamiento")).toBeTruthy();
    expect(screen.getByText(/aquí no se declara ningún modelo live, entrenado o calibrado/i)).toBeTruthy();
  });

  it("uses the existing Admin language context for French truth copy", async () => {
    mocks.language.lang = "fr";
    mocks.language.locale = "fr-FR";
    mocks.invoke.mockResolvedValueOnce({ data: emptySnapshot });

    render(<AdminIntelligence/>);

    expect(await screen.findByText("Limite de preuve · consultatif uniquement")).toBeTruthy();
    expect(screen.getByText("Observations d’outcomes · pas un dataset d’entraînement")).toBeTruthy();
    expect(screen.getByText(/aucun modèle live, entraîné ou calibré n’est déclaré ici/i)).toBeTruthy();
  });
});
