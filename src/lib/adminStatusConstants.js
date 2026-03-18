// Unified status definitions for admin pages
export const DEAL_STATUSES = {
  SUBMITTED: "submitted",
  IN_REVIEW: "in_review",
  PROVIDER_CONTACTED: "provider_contacted",
  OFFER_READY: "offer_ready",
  ACTIVATED: "activated",
  REJECTED: "rejected",
  CLOSED: "closed",
};

export const ALL_STATUSES = [
  DEAL_STATUSES.SUBMITTED,
  DEAL_STATUSES.IN_REVIEW,
  DEAL_STATUSES.PROVIDER_CONTACTED,
  DEAL_STATUSES.OFFER_READY,
  DEAL_STATUSES.ACTIVATED,
  DEAL_STATUSES.REJECTED,
  DEAL_STATUSES.CLOSED,
];

export const STATUS_COLORS = {
  [DEAL_STATUSES.SUBMITTED]: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  [DEAL_STATUSES.IN_REVIEW]: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  [DEAL_STATUSES.PROVIDER_CONTACTED]: "text-purple-600 bg-purple-500/10 border-purple-500/20",
  [DEAL_STATUSES.OFFER_READY]: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  [DEAL_STATUSES.ACTIVATED]: "text-green-600 bg-green-500/10 border-green-500/20",
  [DEAL_STATUSES.REJECTED]: "text-red-600 bg-red-500/10 border-red-500/20",
  [DEAL_STATUSES.CLOSED]: "text-muted-foreground bg-secondary border-border/40",
};