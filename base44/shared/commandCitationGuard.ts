// COMMAND-C3 (2026-08-17) — validates the citations a model emits against the
// evidence it was actually given.
//
// The hole this closes: founderChiefOfStaff asks the model to return
// `evidence_refs: []` on every item of `changed_since_last_view` and
// `founder_actions`. Nothing ever validated those refs, nothing resolved them,
// and the UI never rendered them — while presenting the panel as an
// "Evidence-bounded narrative". The binding between claim and evidence was
// model-generated free text that nobody checked.
//
// This module is deliberately pure and offline: it does not read the database.
// The citable set is built from the SAME snapshot object handed to the model, so
// a ref can only be valid if it names something the model was actually shown.
// That is a stronger guarantee than a row lookup — it also catches a real id the
// model could not have known about and therefore could not have reasoned from.

import { epistemicStateForRead } from './runtimeSourceRead.ts';

export const COMMAND_CITATION_GUARD_VERSION = 'command-citation-guard-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Refs use the `entity:id` convention established by CommandArtifact.source_refs. */
export function citationRef(entity: unknown, id: unknown): string {
  const left = text(entity), right = text(id);
  return left && right ? `${left}:${right}` : '';
}

/**
 * Collects every ref the model is allowed to cite from the evidence snapshot.
 *
 * Anything not in here is, by construction, something the model was not shown.
 */
export function citableRefsFromEvidence(evidence: any): Set<string> {
  const refs = new Set<string>();
  const add = (value: string) => { if (value) refs.add(value); };

  for (const row of Array.isArray(evidence?.attention) ? evidence.attention : []) {
    // attention ids are already namespaced, e.g. "approval:<id>" / "incident:<id>".
    add(text(row?.id));
    add(citationRef(row?.related_entity_type, row?.related_entity_id));
    if (row?.approval_id) add(citationRef('Approval', row.approval_id));
  }
  for (const group of ['opportunities', 'risks']) {
    for (const row of Array.isArray(evidence?.[group]) ? evidence[group] : []) {
      for (const item of Array.isArray(row?.evidence) ? row.evidence : []) {
        add(citationRef(item?.entity, item?.id));
      }
    }
  }
  for (const key of Object.keys(evidence?.metrics || {})) add(citationRef('metric', key));
  for (const row of Array.isArray(evidence?.upcoming_founder_meetings) ? evidence.upcoming_founder_meetings : []) {
    add(citationRef('CommunicationThread', row?.thread_id));
  }
  return refs;
}

export type CitationVerdict = {
  claim: string;
  cited: string[];
  resolved: string[];
  unresolved: string[];
  /** Projected into the Command epistemic vocabulary; never stronger than the evidence. */
  epistemic_state: 'OBSERVED' | 'DERIVED' | 'UNVERIFIED' | 'CONFLICTED' | 'UNKNOWN';
};

/**
 * Judges one model-authored claim.
 *
 * The three outcomes that matter:
 *  - every ref resolves      -> DERIVED (the model reasoned over shown evidence;
 *                              it did not observe anything itself)
 *  - some ref does not       -> CONFLICTED (the claim cites something it was not
 *                              given; that disagreement is the finding)
 *  - nothing cited at all    -> UNVERIFIED (not false — simply unbacked)
 *
 * Note the ceiling: a model claim can never be OBSERVED here. Observation is
 * something the canonical read did, not something the narrative did.
 */
export function judgeClaim(claim: unknown, refs: unknown, citable: Set<string>): CitationVerdict {
  const cited = [...(Array.isArray(refs) ? refs : [])].map(text).filter(Boolean);
  const resolved = cited.filter((ref) => citable.has(ref));
  const unresolved = cited.filter((ref) => !citable.has(ref));
  let state: CitationVerdict['epistemic_state'];
  if (!cited.length) state = 'UNVERIFIED';
  else if (unresolved.length) state = 'CONFLICTED';
  else state = 'DERIVED';
  return { claim: text(claim), cited, resolved, unresolved, epistemic_state: state };
}

/**
 * Applies the guard to a Chief of Staff brief.
 *
 * Returns the brief with every cited item annotated, plus a summary the caller
 * can surface. Claims are ANNOTATED, never silently deleted: quietly dropping a
 * badly-cited claim would hide that the model fabricated a reference, which is
 * exactly the signal worth keeping.
 */
export function guardBriefCitations(brief: any, evidence: any) {
  const citable = citableRefsFromEvidence(evidence);
  const annotate = (rows: any) => (Array.isArray(rows) ? rows : []).map((row: any) => {
    const verdict = judgeClaim(row?.text || row?.title, row?.evidence_refs, citable);
    return {
      ...row,
      evidence_refs: verdict.cited,
      resolved_evidence_refs: verdict.resolved,
      unresolved_evidence_refs: verdict.unresolved,
      epistemic_state: verdict.epistemic_state,
    };
  });

  const changed = annotate(brief?.changed_since_last_view);
  const actions = annotate(brief?.founder_actions);
  const all = [...changed, ...actions];
  const fabricated = all.filter((row) => row.unresolved_evidence_refs.length);
  const uncited = all.filter((row) => !row.evidence_refs.length);

  return {
    brief: { ...brief, changed_since_last_view: changed, founder_actions: actions },
    citation_audit: {
      version: COMMAND_CITATION_GUARD_VERSION,
      citable_ref_count: citable.size,
      claims_checked: all.length,
      claims_backed: all.filter((row) => row.epistemic_state === 'DERIVED').length,
      claims_uncited: uncited.length,
      claims_with_unresolved_refs: fabricated.length,
      unresolved_refs: [...new Set(fabricated.flatMap((row) => row.unresolved_evidence_refs))].sort(),
      // The single field a caller should gate on. False means at least one claim
      // in this brief points at evidence that was never supplied.
      all_claims_backed: all.length > 0 && fabricated.length === 0 && uncited.length === 0,
    },
  };
}

/**
 * The ceiling the underlying snapshot puts on the whole brief.
 *
 * A narrative built on a degraded snapshot cannot be better than the snapshot,
 * however well it cites. Uses the same one-way projection as every other
 * Command surface so no ninth vocabulary appears here.
 */
export function briefEpistemicCeiling(snapshot: any): 'OBSERVED' | 'DERIVED' | 'UNKNOWN' {
  return epistemicStateForRead({
    status: snapshot?.data_complete === false ? 'UNAVAILABLE' : 'COMPLETE',
    records_read: snapshot?.data_complete === false ? null : 1,
  });
}
