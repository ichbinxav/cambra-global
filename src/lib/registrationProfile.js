import { base44 } from "@/api/base44Client";

export const ANALYZER_DRAFT_STORAGE_KEY = "cambra_analyzer_draft";
export const REGISTRATION_PROFILE_STORAGE_KEY = "cambra_registration_profile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANALYZER_SECTORS = new Set([
  "fashion",
  "beauty",
  "food_beverage",
  "home_living",
  "electronics",
  "health_wellness",
  "other",
]);

const BRAND_CATEGORY_BY_SECTOR = {
  fashion: "fashion",
  beauty: "beauty",
  food_beverage: "food_bev",
  home_living: "home",
  electronics: "tech",
  health_wellness: "wellness",
  other: "other",
};

function readSessionJson(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readAnalyzerDraft() {
  return readSessionJson(ANALYZER_DRAFT_STORAGE_KEY);
}

export function writeAnalyzerDraft(patch) {
  return writeSessionJson(ANALYZER_DRAFT_STORAGE_KEY, {
    ...readAnalyzerDraft(),
    ...patch,
    updatedAt: Date.now(),
  });
}

export function isAnalyzerBusinessDraftComplete(draft = readAnalyzerDraft()) {
  const brandName = String(draft.brandName || "").trim();
  const website = String(draft.website || "").trim();
  const email = String(draft.email || "").trim();
  return Boolean(
    String(draft.country || "").trim()
    && brandName.length >= 2
    && brandName.length <= 80
    && website
    && website.length <= 200
    && !/\s/.test(website)
    && /\./.test(website)
    && EMAIL_RE.test(email)
    && ANALYZER_SECTORS.has(String(draft.sector || "")),
  );
}

export function readRegistrationProfile() {
  return readSessionJson(REGISTRATION_PROFILE_STORAGE_KEY);
}

export function writeRegistrationProfile(profile) {
  return writeSessionJson(REGISTRATION_PROFILE_STORAGE_KEY, {
    ...profile,
    updatedAt: Date.now(),
  });
}

function supportedEmailLocale(lang) {
  return ["en", "fr", "es"].includes(lang) ? lang : "en";
}

async function findOwnedBrand(email) {
  const byContact = await base44.entities.Brand
    .filter({ contact_email: email }, "-created_date", 1)
    .catch(() => []);
  if (byContact[0]) return byContact[0];
  const byCreator = await base44.entities.Brand
    .filter({ created_by: email }, "-created_date", 1)
    .catch(() => []);
  return byCreator[0] || null;
}

/**
 * Applies the pre-auth registration profile once the authenticated identity is
 * available. The authenticated email remains the ownership address even if a
 * visitor typed a different address before entering the hosted login screen.
 */
export async function syncRegistrationProfile(user, lang = "en") {
  const draft = readRegistrationProfile();
  if (!draft.businessName || !user?.email) return null;

  const fullName = String(draft.fullName || "").trim();
  if (fullName && fullName !== user.full_name) {
    await base44.auth.updateMe({ full_name: fullName }).catch(() => null);
  }

  const brand = await findOwnedBrand(user.email);
  const payload = {
    name: String(draft.businessName).trim(),
    contact_name: fullName || user.full_name || "",
    contact_email: user.email,
    locale: supportedEmailLocale(lang),
    ...(draft.website ? { website: String(draft.website).trim() } : {}),
    ...(draft.country ? { country: String(draft.country).trim().toUpperCase() } : {}),
    ...(BRAND_CATEGORY_BY_SECTOR[draft.sector]
      ? { category: BRAND_CATEGORY_BY_SECTOR[draft.sector] }
      : {}),
  };

  const saved = brand
    ? await base44.entities.Brand.update(brand.id, payload)
    : await base44.entities.Brand.create(payload);

  try { sessionStorage.removeItem(REGISTRATION_PROFILE_STORAGE_KEY); } catch {}
  return saved;
}
