// DASHBOARD-C16 (2026-08-17) — the single founder queue.
//
// The remaining half of founder decision 3. C14 put Inbox and Approvals in one place, which was
// the navigation decision, and said plainly that it did NOT merge them into one ranked list —
// because ranking across three differently-shaped sources needs an ordering, and inventing one
// silently would be a guess about what a founder should look at first.
//
// So the ordering is DECLARED, not inferred. It is a stated rule that can be wrong on a given
// day, and the response carries the rule so a reader can disagree with it rather than having to
// reverse-engineer it from the order.
//
// THE RULE, and why each step is where it is:
//
//   1. An expired item first. An approval or question past its expiry has already failed to be
//      answered in time; whatever it was gating is now in an undefined state, and that is worse
//      than something still waiting.
//   2. Then approvals. An approval blocks an agent task that is already running — the work has
//      started and stopped. A question blocks work that has not started.
//   3. Then questions. An agent is waiting on an answer it cannot proceed without.
//   4. Then tasks in REVIEW_REQUIRED. Nothing is waiting on a human here, but the task has
//      reached a state no automatic path leaves.
//   5. Within every band, OLDEST FIRST. The oldest unanswered item is the one most likely to
//      have been forgotten, which is the failure this queue exists to prevent.
//
// WHAT THE QUEUE DOES NOT DO: it does not rank by business value. It has no way to know that one
// approval is worth more than another, and ordering by a guessed value would bury a cheap item
// that blocks an expensive one.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableNumber } from './nullableNumber.ts';

export const FOUNDER_QUEUE_VERSION = 'founder-queue-1.1.0';

const text = (value: unknown) => String(value ?? '').trim();
const READ_LIMIT = 1000;

/** The declared ordering. Exposed so the UI can show it and a caller can argue with it. */
export const QUEUE_ORDERING_RULE = Object.freeze([
  { band: 1, key: 'EXPIRED', why: 'already failed to be answered in time; whatever it gated is in an undefined state' },
  { band: 2, key: 'APPROVAL', why: 'blocks a task that is already running — the work started and stopped' },
  { band: 3, key: 'QUESTION', why: 'an agent cannot proceed without an answer' },
  { band: 4, key: 'REVIEW_REQUIRED', why: 'no automatic path leaves this state, though nobody is waiting on a human' },
] as const);

export const QUEUE_ORDERING_NOTE =
  'Ordering is a declared rule, not a learned one: expired first, then approvals, then questions, '
  + 'then tasks in review, oldest first within each band. It does NOT rank by business value — the '
  + 'queue has no way to know one approval is worth more than another, and guessing would bury a '
  + 'cheap item that blocks an expensive one.';

export type QueueItem = {
  id: string;
  kind: 'APPROVAL' | 'QUESTION' | 'TASK_REVIEW';
  band: number;
  band_key: string;
  expired: boolean;
  waiting_since: string | null;
  waiting_days: number | null;
  summary: string;
  agent_name: string | null;
  agent_task_id: string | null;
  blocks_running_work: boolean;
  source_entity: string;
  action: {
    type: 'APPROVAL_DECISION' | 'ANSWER_QUESTION' | 'OPEN_WORKSPACE';
    label: string;
    href: string;
    enabled: boolean;
    disabled_reason: string | null;
  };
  record: Record<string, unknown>;
};

function taskReviewAction(row: any) {
  const agent = text(row?.agent_name).toLowerCase();
  const taskType = text(row?.task_type).toLowerCase();
  const domain = `${agent} ${taskType}`;
  if (/recover|billing|invoice|reconcil/.test(domain)) {
    return { label: 'Resolve billing review', href: '/admin/finance?tab=merchant-billing' };
  }
  if (/webhook|dead.?letter|ecl|lifecycle|incident/.test(domain)) {
    return { label: 'Open ECL operations', href: '/admin/ecl-operations' };
  }
  if (/campaign|outreach|follow.?up|commercial|newsletter|linkedin|twitter/.test(domain)) {
    return { label: 'Open campaign workspace', href: '/admin/campaigns' };
  }
  if (/intelligence|pricing|benchmark|research|knowledge/.test(domain)) {
    return { label: 'Open Intelligence', href: '/admin/intelligence' };
  }
  if (/developer|migration/.test(domain)) {
    return { label: 'Open developer control', href: '/admin/developer' };
  }
  return { label: 'Open Founder Control', href: '/admin/founder-control' };
}

function taskReviewKey(row: any) {
  const workflow = text(row?.workflow_key) || text(row?.task_type) || text(row?.id);
  const scope = text(row?.related_entity_id) || text(row?.subject_id) || text(row?.brand_id) || '_platform';
  return `${text(row?.agent_name) || 'unknown'}|${workflow}|${scope}`;
}

function newestTaskRows(rows: any[]) {
  const latest = new Map<string, any>();
  for (const row of rows) {
    const key = taskReviewKey(row);
    const current = latest.get(key);
    const at = Date.parse(text(row?.created_date) || text(row?.started_at) || '') || 0;
    const currentAt = Date.parse(text(current?.created_date) || text(current?.started_at) || '') || 0;
    if (!current || at > currentAt || (at === currentAt && text(row?.id) > text(current?.id))) {
      latest.set(key, row);
    }
  }
  return [...latest.values()];
}

const daysBetween = (from: string | null, now: string): number | null => {
  if (!from) return null;
  const start = Date.parse(from);
  const end = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86400000);
};

const isExpired = (row: any, now: string) => {
  const expires = text(row?.expires_at);
  if (!expires) return false;
  const at = Date.parse(expires);
  return Number.isFinite(at) && at < Date.parse(now);
};

/**
 * Builds the single ranked queue.
 *
 * Each source is read independently and a failed source is reported as a failed source — a queue
 * that silently drops approvals because one read threw would be a queue that says there is
 * nothing to do.
 */
export async function buildFounderQueue(input: {
  svc: any;
  now: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(input.limit) || 200, 1), READ_LIMIT);
  const read = async (source: string, fn: () => Promise<any[]>) =>
    readRuntimeSource<any[]>({ source, read: fn, fallback: [], limit });

  const reads: Record<string, any> = {
    Approval: await read('Approval', () => input.svc.entities.Approval.list('-created_date', limit)),
    AgentQuestion: await read('AgentQuestion', () => input.svc.entities.AgentQuestion.list('-created_date', limit)),
    AgentTask: await read('AgentTask', () => input.svc.entities.AgentTask.list('-created_date', limit)),
  };
  const rows = (key: string): any[] => (reads[key].status === 'UNAVAILABLE' ? [] : (reads[key].value || []));
  const unavailable = Object.keys(reads).filter((key) => reads[key].status === 'UNAVAILABLE');

  const items: QueueItem[] = [];

  for (const row of rows('Approval')) {
    if (text(row.status).toLowerCase() !== 'pending') continue;
    const expired = isExpired(row, input.now);
    const since = text(row.created_date) || text(row.created_at) || null;
    items.push({
      id: text(row.id),
      kind: 'APPROVAL',
      band: expired ? 1 : 2,
      band_key: expired ? 'EXPIRED' : 'APPROVAL',
      expired,
      waiting_since: since,
      waiting_days: daysBetween(since, input.now),
      summary: text(row.title) || text(row.action_type) || text(row.description) || 'Approval',
      agent_name: text(row.agent_name) || null,
      agent_task_id: text(row.agent_task_id) || null,
      // An approval gates a task that has already started.
      blocks_running_work: Boolean(text(row.agent_task_id)),
      source_entity: 'Approval',
      action: {
        type: expired ? 'OPEN_WORKSPACE' : 'APPROVAL_DECISION',
        label: expired ? 'Inspect expired approval' : 'Review & decide',
        href: '/admin/approvals',
        enabled: !expired,
        disabled_reason: expired ? 'The approval expired and cannot be executed.' : null,
      },
      record: {
        id: text(row.id),
        status: text(row.status),
        action_type: text(row.action_type),
        risk_level: Number(row.risk_level || 0),
        draft_content: text(row.draft_content),
        brand_id: text(row.brand_id) || null,
        agent_task_id: text(row.agent_task_id) || null,
        related_entity_type: text(row.related_entity_type) || null,
        related_entity_id: text(row.related_entity_id) || null,
        created_date: text(row.created_date) || text(row.created_at) || null,
        expires_at: text(row.expires_at) || null,
      },
    });
  }

  for (const row of rows('AgentQuestion')) {
    if (text(row.status).toLowerCase() !== 'pending') continue;
    const expired = isExpired(row, input.now);
    const since = text(row.created_date) || null;
    items.push({
      id: text(row.id),
      kind: 'QUESTION',
      band: expired ? 1 : 3,
      band_key: expired ? 'EXPIRED' : 'QUESTION',
      expired,
      waiting_since: since,
      waiting_days: daysBetween(since, input.now),
      summary: text(row.question_text) || 'Question',
      agent_name: text(row.agent_name) || null,
      agent_task_id: text(row.agent_task_id) || null,
      blocks_running_work: false,
      source_entity: 'AgentQuestion',
      action: {
        type: expired ? 'OPEN_WORKSPACE' : 'ANSWER_QUESTION',
        label: expired ? 'Inspect expired question' : 'Answer now',
        href: '/admin/inbox',
        enabled: !expired,
        disabled_reason: expired ? 'The question expired and cannot be answered.' : null,
      },
      record: {
        id: text(row.id),
        status: text(row.status),
        agent_name: text(row.agent_name) || null,
        agent_task_id: text(row.agent_task_id) || null,
        question_type: text(row.question_type) || 'text',
        question_text: text(row.question_text),
        context_summary: text(row.context_summary) || null,
        options: Array.isArray(row.options) ? row.options.map(text).filter(Boolean).slice(0, 20) : [],
        access_link: text(row.access_link) || null,
        created_date: text(row.created_date) || null,
        expires_at: text(row.expires_at) || null,
      },
    });
  }

  // REVIEW_REQUIRED is terminal history. Only the newest run of the same
  // workflow/scope can still require action; a later successful run supersedes
  // the older review instead of leaving a permanent ghost in the founder queue.
  for (const row of newestTaskRows(rows('AgentTask'))) {
    // Only the states no automatic path leaves. A failed task retries; a REVIEW_REQUIRED one
    // does not.
    const terminal = text(row.terminal_state).toUpperCase();
    const execution = text(row.execution_status).toUpperCase();
    const ambiguity = text(row.ambiguity_state).toUpperCase();
    const needsReview = terminal === 'REVIEW_REQUIRED' || execution === 'REVIEW_REQUIRED'
      || ambiguity === 'REVIEW_REQUIRED';
    if (!needsReview) continue;
    const since = text(row.created_date) || null;
    const destination = taskReviewAction(row);
    const result = row.output_payload_json && typeof row.output_payload_json === 'object'
      ? row.output_payload_json
      : {};
    items.push({
      id: text(row.id),
      kind: 'TASK_REVIEW',
      band: 4,
      band_key: 'REVIEW_REQUIRED',
      expired: false,
      waiting_since: since,
      waiting_days: daysBetween(since, input.now),
      summary: text(row.description) || text(row.task_type) || 'Task in review',
      agent_name: text(row.agent_name) || null,
      agent_task_id: text(row.id) || null,
      blocks_running_work: true,
      source_entity: 'AgentTask',
      action: {
        type: 'OPEN_WORKSPACE',
        label: destination.label,
        href: destination.href,
        enabled: true,
        disabled_reason: null,
      },
      record: {
        id: text(row.id),
        status: text(row.status) || null,
        agent_name: text(row.agent_name) || null,
        task_type: text(row.task_type) || null,
        terminal_state: terminal || null,
        execution_status: execution || null,
        ambiguity_state: ambiguity || null,
        output_summary: text(row.output_summary) || null,
        error: text(row.error) || null,
        review_blocks: Array.isArray(result.review_blocks)
          ? result.review_blocks.map(text).filter(Boolean).slice(0, 50)
          : [],
        related_entity_type: text(row.related_entity_type) || null,
        related_entity_id: text(row.related_entity_id) || null,
        created_date: since,
      },
    });
  }

  // Band, then oldest first. An item with no timestamp sorts LAST within its band: it is not
  // "brand new", it is undated, and treating undated as newest would hide it forever.
  const ordered = [...items].sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    const aTime = a.waiting_since ? Date.parse(a.waiting_since) : Number.POSITIVE_INFINITY;
    const bTime = b.waiting_since ? Date.parse(b.waiting_since) : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });

  const oldest = ordered.map((row) => row.waiting_days).filter((days): days is number => days !== null);

  return {
    ok: true as const,
    items: ordered,
    ordering_rule: QUEUE_ORDERING_RULE.map((row) => ({ ...row })),
    ordering_note: QUEUE_ORDERING_NOTE,
    // null, not 0, whenever a source could not be read: a partial queue that reports a total
    // reads as complete.
    total: unavailable.length ? null : ordered.length,
    counts: unavailable.length ? null : {
      expired: ordered.filter((row) => row.expired).length,
      approvals: ordered.filter((row) => row.kind === 'APPROVAL' && !row.expired).length,
      questions: ordered.filter((row) => row.kind === 'QUESTION' && !row.expired).length,
      tasks_in_review: ordered.filter((row) => row.kind === 'TASK_REVIEW').length,
    },
    oldest_waiting_days: oldest.length ? Math.max(...oldest) : null,
    unavailable_sources: unavailable,
    // Stated on every response: an incomplete queue is not an empty one.
    complete: unavailable.length === 0,
    coverage_note: unavailable.length
      ? `${unavailable.join(', ')} could not be read, so this queue is incomplete and the counts are withheld. `
        + 'Items from those sources are missing, not absent.'
      : 'All three sources read completely.',
    limit_applied: limit,
    truncated: Object.keys(reads).some((key) => reads[key].truncated),
  };
}

/** The count for a badge. Null when the queue is incomplete, so a badge never understates. */
export async function founderQueueBadge(input: { svc: any; now: string }) {
  const queue = await buildFounderQueue({ svc: input.svc, now: input.now, limit: READ_LIMIT });
  return {
    ok: true as const,
    count: queue.total,
    expired: queue.counts ? queue.counts.expired : null,
    complete: queue.complete,
    oldest_waiting_days: nullableNumber(queue.oldest_waiting_days),
  };
}
