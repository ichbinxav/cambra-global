export const COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED =
  "COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED";
export const COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED =
  "COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED";
export const COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED =
  "COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED";

export const PROTECTED_ANTHROPIC_SOURCE_PURPOSES = Object.freeze({
  codeReviewAgent: "admin_requested_code_review",
  founderCopilotAgent: "admin_founder_daily_brief",
  qaAgent: "admin_requested_qa_flow_review",
  qaMonitorAgent: "admin_runtime_failure_monitoring",
  securityAgent: "admin_requested_security_review",
} as const);

export type ProtectedAnthropicSource =
  keyof typeof PROTECTED_ANTHROPIC_SOURCE_PURPOSES;
export type ProtectedAnthropicPurpose =
  typeof PROTECTED_ANTHROPIC_SOURCE_PURPOSES[ProtectedAnthropicSource];

export type ObservedAnthropicEgressPolicy = {
  status: "OBSERVED";
  policy_id: string;
  policy_hash: string;
  purpose: ProtectedAnthropicPurpose;
  expires_at: string;
};

export type AnthropicEgressPolicyResolution =
  | { ok: true; evidence: ObservedAnthropicEgressPolicy }
  | {
    ok: false;
    code: typeof COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED;
    reason:
      | "STATUS_NOT_APPROVED"
      | "POLICY_ID_INVALID"
      | "POLICY_HASH_INVALID"
      | "PURPOSE_NOT_ALLOWED"
      | "EXPIRY_REQUIRED"
      | "EXPIRY_INVALID"
      | "POLICY_EXPIRED";
  };

type EnvReader = (name: string) => string | undefined;

const SAFE_POLICY_ID = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{2,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_ISO8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROTECTED_PURPOSES = new Set<ProtectedAnthropicPurpose>(
  Object.values(PROTECTED_ANTHROPIC_SOURCE_PURPOSES),
);

function runtimeEnv(name: string): string | undefined {
  try {
    const deno = (globalThis as any)?.Deno;
    const value = deno?.env?.get?.(name);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function protectedAnthropicPurposeForSource(
  source: unknown,
): ProtectedAnthropicPurpose | null {
  const key = String(source || "") as ProtectedAnthropicSource;
  return PROTECTED_ANTHROPIC_SOURCE_PURPOSES[key] || null;
}

/**
 * Resolve only deployment-observed policy evidence. Request data can never
 * approve provider egress and no default is permissive.
 */
export function resolveObservedAnthropicEgressPolicy(
  purpose: ProtectedAnthropicPurpose,
  options: { getEnv?: EnvReader; now?: Date } = {},
): AnthropicEgressPolicyResolution {
  if (!PROTECTED_PURPOSES.has(purpose)) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "PURPOSE_NOT_ALLOWED",
    };
  }
  const getEnv = options.getEnv || runtimeEnv;
  const readEnv = (name: string) => {
    try {
      return getEnv(name);
    } catch {
      return undefined;
    }
  };
  if (String(readEnv("CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS") || "").trim() !== "APPROVED") {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "STATUS_NOT_APPROVED",
    };
  }
  const policyId = String(
    readEnv("CAMBRA_ANTHROPIC_EGRESS_POLICY_ID") || "",
  ).trim();
  const policyIdSafety = SAFE_POLICY_ID.test(policyId)
    ? sanitizeCommercialString(policyId)
    : null;
  if (
    !policyIdSafety?.ok || policyIdSafety.redactions > 0 ||
    policyIdSafety.value !== policyId
  ) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "POLICY_ID_INVALID",
    };
  }
  const policyHash = String(
    readEnv("CAMBRA_ANTHROPIC_EGRESS_POLICY_SHA256") || "",
  ).trim().toLowerCase();
  if (!SHA256.test(policyHash)) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "POLICY_HASH_INVALID",
    };
  }
  const allowedPurposes = new Set(
    String(readEnv("CAMBRA_ANTHROPIC_EGRESS_POLICY_PURPOSES") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowedPurposes.has(purpose)) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "PURPOSE_NOT_ALLOWED",
    };
  }
  const expiresRaw = String(
    readEnv("CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT") || "",
  ).trim();
  if (!expiresRaw) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "EXPIRY_REQUIRED",
    };
  }
  if (!CANONICAL_ISO8601_UTC.test(expiresRaw)) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "EXPIRY_INVALID",
    };
  }
  const parsed = Date.parse(expiresRaw);
  const nowMs = (options.now || new Date()).getTime();
  if (!Number.isFinite(parsed) || !Number.isFinite(nowMs)) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "EXPIRY_INVALID",
    };
  }
  const expiresAt = new Date(parsed).toISOString();
  if (expiresAt !== expiresRaw) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "EXPIRY_INVALID",
    };
  }
  if (parsed <= nowMs) {
    return {
      ok: false,
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      reason: "POLICY_EXPIRED",
    };
  }
  return {
    ok: true,
    evidence: {
      status: "OBSERVED",
      policy_id: policyId,
      policy_hash: policyHash,
      purpose,
      expires_at: expiresAt,
    },
  };
}

export function observedPolicyContext(
  policy: ObservedAnthropicEgressPolicy,
) {
  return {
    status: "OBSERVED" as const,
    id: policy.policy_id,
    hash: policy.policy_hash,
    key: `anthropic_egress:${policy.purpose}`,
    version: "anthropic-egress-policy-v1",
  };
}

export function observedPolicyMetadata(
  policy: ObservedAnthropicEgressPolicy,
) {
  return {
    status: policy.status,
    policy_id: policy.policy_id,
    policy_hash: policy.policy_hash,
    purpose: policy.purpose,
    expires_at: policy.expires_at,
  };
}

function policyEvidenceMatches(
  expected: ObservedAnthropicEgressPolicy,
  supplied: ObservedAnthropicEgressPolicy | null | undefined,
) {
  return Boolean(
    supplied && supplied.status === "OBSERVED" &&
      supplied.policy_id === expected.policy_id &&
      supplied.policy_hash === expected.policy_hash &&
      supplied.purpose === expected.purpose &&
      supplied.expires_at === expected.expires_at,
  );
}

export function protectedCommercialReviewError(code: string) {
  const stable = [
    COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
    COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
    COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED,
  ].includes(code)
    ? code
    : COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED;
  return Object.assign(new Error(stable.toLowerCase()), {
    code: stable,
    status: 409,
    review_required: true,
    automatic_retry_blocked: true,
  });
}

/** Re-observe the deployment policy immediately before any paid operation. */
export function assertObservedAnthropicEgressPolicy(
  source: ProtectedAnthropicSource,
  purpose: ProtectedAnthropicPurpose,
  supplied: ObservedAnthropicEgressPolicy | null | undefined,
  options: { getEnv?: EnvReader; now?: Date } = {},
) {
  if (PROTECTED_ANTHROPIC_SOURCE_PURPOSES[source] !== purpose) {
    throw protectedCommercialReviewError(
      COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
    );
  }
  const current = resolveObservedAnthropicEgressPolicy(purpose, options);
  if (!current.ok || !policyEvidenceMatches(current.evidence, supplied)) {
    throw protectedCommercialReviewError(
      COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
    );
  }
  return current.evidence;
}

/** Testable guard: `invoke` is unreachable unless evidence is observed. */
export async function executeWithObservedAnthropicEgress<T>(
  input: {
    source: ProtectedAnthropicSource;
    purpose: ProtectedAnthropicPurpose;
    policy: ObservedAnthropicEgressPolicy | null | undefined;
    getEnv?: EnvReader;
    now?: Date;
  },
  invoke: (policy: ObservedAnthropicEgressPolicy) => Promise<T> | T,
) {
  const policy = assertObservedAnthropicEgressPolicy(
    input.source,
    input.purpose,
    input.policy,
    { getEnv: input.getEnv, now: input.now },
  );
  return await invoke(policy);
}

export type CommercialEgressLimits = {
  maxDepth: number;
  maxArrayItems: number;
  maxObjectKeys: number;
  maxStringBytes: number;
  maxTotalBytes: number;
};

export const COMMERCIAL_PROVIDER_INPUT_LIMITS: CommercialEgressLimits =
  Object.freeze({
    maxDepth: 8,
    maxArrayItems: 50,
    maxObjectKeys: 100,
    maxStringBytes: 48_000,
    maxTotalBytes: 64_000,
  });
export const COMMERCIAL_PROVIDER_OUTPUT_LIMITS: CommercialEgressLimits =
  Object.freeze({
    maxDepth: 8,
    maxArrayItems: 50,
    maxObjectKeys: 100,
    maxStringBytes: 32_000,
    maxTotalBytes: 64_000,
  });

type SanitizationIssue =
  | "DEPTH_LIMIT"
  | "ARRAY_LIMIT"
  | "OBJECT_LIMIT"
  | "KEY_LIMIT"
  | "STRING_LIMIT"
  | "TOTAL_LIMIT"
  | "CIRCULAR_VALUE"
  | "UNSUPPORTED_VALUE"
  | "UNSAFE_RESIDUE";

export type CommercialEgressSanitization =
  | { ok: true; value: unknown; bytes: number; redactions: number }
  | { ok: false; issue: SanitizationIssue };

const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).byteLength;
const SAFE_OBJECT_KEY = /^[\w .:/-]{1,160}$/u;
const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SECRET_KEY_SUFFIXES = [
  "awssecretaccesskey",
  "awssessiontoken",
  "refreshtoken",
  "sessiontoken",
  "accesstoken",
  "clientsecret",
  "webhooksecret",
  "privatesigningkey",
  "privatekey",
  "accountkey",
  "secretkey",
  "authorization",
  "apitoken",
  "xapikey",
  "apikey",
  "idtoken",
  "password",
  "passwd",
  "token",
  "secret",
] as const;
const normalizedCredentialKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]+/g, "");
const credentialKeyTokens = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const SECRET_KEY_TOKENS = new Set([
  "auth",
  "authentication",
  "authorization",
  "credential",
  "credentials",
  "passwd",
  "password",
  "secret",
  "token",
]);
const isSecretObjectKey = (key: string) => {
  const normalized = normalizedCredentialKey(key);
  return normalized.length > 0 && (
    SECRET_KEY_SUFFIXES.some((suffix) =>
      normalized === suffix || normalized.endsWith(suffix)
    ) || credentialKeyTokens(key).some((token) => SECRET_KEY_TOKENS.has(token))
  );
};
const REDACTED_SECRET = "[redacted-secret]";
const REDACTED_EMAIL = "[redacted-email]";
const REDACTED_PHONE = "[redacted-phone]";
const REDACTED_IDENTITY = "[redacted-identity]";
const REDACTED_ADDRESS = "[redacted-address]";
const REDACTED_FINANCIAL = "[redacted-financial]";
const REDACTED_PII = "[redacted-pii]";
const REDACTION_MARKER_SOURCE =
  String.raw`\[(?:redacted-secret|redacted-email|redacted-phone|redacted-identity|redacted-address|redacted-financial|redacted-pii)\]`;

const PII_KEY_SUFFIXES = [
  "emailaddress",
  "phonenumber",
  "mobilenumber",
  "cellphone",
  "telephone",
  "postaladdress",
  "streetaddress",
  "passportnumber",
  "socialsecuritynumber",
  "nationalid",
  "taxid",
  "bankaccount",
  "creditcard",
  "cardnumber",
  "email",
  "phone",
  "mobile",
  "address",
  "passport",
  "ssn",
  "iban",
  "dni",
  "nie",
] as const;
const PII_KEY_TOKENS = new Set([
  "address",
  "cellphone",
  "dni",
  "email",
  "iban",
  "mobile",
  "nie",
  "passport",
  "phone",
  "ssn",
  "telephone",
]);
const PII_KEY_TOKEN_PAIRS = new Set([
  "bankaccount",
  "cardnumber",
  "creditcard",
  "nationalid",
  "socialsecurity",
  "taxid",
]);
const isPiiObjectKey = (key: string) => {
  const normalized = normalizedCredentialKey(key);
  const tokens = credentialKeyTokens(key);
  return normalized.length > 0 && (
    PII_KEY_SUFFIXES.some((suffix) =>
      normalized === suffix || normalized.endsWith(suffix)
    ) || tokens.some((token) => PII_KEY_TOKENS.has(token)) ||
    tokens.slice(0, -1).some((token, index) =>
      PII_KEY_TOKEN_PAIRS.has(`${token}${tokens[index + 1]}`)
    )
  );
};
const piiMarkerForKey = (key: string) => {
  const normalized = normalizedCredentialKey(key);
  if (/email/.test(normalized)) return REDACTED_EMAIL;
  if (/(phone|mobile|telephone|cellphone)/.test(normalized)) {
    return REDACTED_PHONE;
  }
  if (/(address)/.test(normalized)) return REDACTED_ADDRESS;
  if (/(iban|bankaccount|creditcard|cardnumber)/.test(normalized)) {
    return REDACTED_FINANCIAL;
  }
  if (/(dni|nie|passport|ssn|socialsecurity|nationalid|taxid)/.test(normalized)) {
    return REDACTED_IDENTITY;
  }
  return REDACTED_PII;
};

const ASSIGNMENT_VALUE =
  "(?:(?:Bearer|Basic)[ \\t]+[A-Za-z0-9._~+/=-]+|\"[^\"\\r\\n]+\"|'[^'\\r\\n]+'|`[^`\\r\\n]+`|[^\\s,;}\\]\\)\"'`]+)";
const CREDENTIAL_KEY_SOURCE =
  String.raw`(?:(['"])([A-Za-z_$][A-Za-z0-9_$.-]{0,159})\1|([A-Za-z_$][A-Za-z0-9_$.-]{0,159}))`;
const TYPED_CREDENTIAL_ASSIGNMENT = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}([ \t]*\??[ \t]*:[ \t\r\n]*[^=;,]{1,160}?[ \t\r\n]*=[ \t\r\n]*)(?!['"\x60]?${REDACTION_MARKER_SOURCE}['"\x60]?)${ASSIGNMENT_VALUE}`,
  "gi",
);
const EQUAL_CREDENTIAL_ASSIGNMENT = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}([ \t\r\n]*=[ \t\r\n]*)(?!['"\x60]?${REDACTION_MARKER_SOURCE}['"\x60]?)${ASSIGNMENT_VALUE}`,
  "gi",
);
const COLON_CREDENTIAL_ASSIGNMENT = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}([ \t\r\n]*:[ \t\r\n]*)(?![^=;,\r\n]{1,160}[ \t\r\n]*=)(?!['"\x60]?${REDACTION_MARKER_SOURCE}['"\x60]?)${ASSIGNMENT_VALUE}`,
  "gi",
);
const CREDENTIAL_ASSIGNMENTS = [
  TYPED_CREDENTIAL_ASSIGNMENT,
  EQUAL_CREDENTIAL_ASSIGNMENT,
  COLON_CREDENTIAL_ASSIGNMENT,
] as const;
const ENV_BRACKET_ASSIGNMENT = new RegExp(
  String.raw`(process[ \t]*\.[ \t]*env[ \t]*\[[ \t\r\n]*)(['"\x60])([^'"\x60\r\n]{1,160})\2([ \t\r\n]*\][ \t\r\n]*[:=][ \t\r\n]*)(?!['"\x60]?${REDACTION_MARKER_SOURCE}['"\x60]?)${ASSIGNMENT_VALUE}`,
  "gi",
);
const DENO_ENV_SET_ASSIGNMENT = new RegExp(
  String.raw`(Deno[ \t]*\.[ \t]*env[ \t]*\.[ \t]*set[ \t]*\([ \t\r\n]*)(['"\x60])([^'"\x60\r\n]{1,160})\2([ \t\r\n]*,[ \t\r\n]*)(?!['"\x60]?${REDACTION_MARKER_SOURCE}['"\x60]?)${ASSIGNMENT_VALUE}`,
  "gi",
);
const TYPED_SENSITIVE_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}[ \t]*\??[ \t]*:[ \t\r\n]*[^=;,]{1,160}?[ \t\r\n]*=[ \t\r\n]*`,
  "gi",
);
const DIRECT_SENSITIVE_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}[ \t\r\n]*[:=][ \t\r\n]*`,
  "gi",
);
const ENV_BRACKET_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`process[ \t]*\.[ \t]*env[ \t]*\[[ \t\r\n]*(['"\x60])([^'"\x60\r\n]{1,160})\1[ \t\r\n]*\][ \t\r\n]*[:=][ \t\r\n]*`,
  "gi",
);
const DENO_ENV_SET_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`Deno[ \t]*\.[ \t]*env[ \t]*\.[ \t]*set[ \t]*\([ \t\r\n]*(['"\x60])([^'"\x60\r\n]{1,160})\1[ \t\r\n]*,[ \t\r\n]*`,
  "gi",
);
const COMPLETE_REDACTION_VALUE = new RegExp(
  String.raw`^(?:(['"\x60])${REDACTION_MARKER_SOURCE}\1|${REDACTION_MARKER_SOURCE})(?=[ \t]*(?:$|[,;}\]\)]|\r?\n))`,
  "i",
);
const COMPLEX_TYPED_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}[ \t]*\??[ \t]*:[ \t\r\n]*([^=;]{1,4096}?)[ \t\r\n]*=[ \t\r\n]*`,
  "gi",
);
const LINE_SPLIT_AUTHORIZATION_ASSIGNMENT = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}[ \t\r\n]*[:=][ \t]*(?:(?:Bearer|Basic)[ \t]*\r?\n|\r?\n[ \t]*(?:Bearer|Basic)\b)`,
  "gi",
);
const CODE_COMMENT_SOURCE =
  String.raw`(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))`;
const UNICODE_LAYOUT_CHARACTER_SOURCE =
  String.raw`[\p{White_Space}\p{Pattern_White_Space}\p{Cc}\p{Cf}]`;
const COMMENTED_SENSITIVE_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}${UNICODE_LAYOUT_CHARACTER_SOURCE}*(?:${CODE_COMMENT_SOURCE}${UNICODE_LAYOUT_CHARACTER_SOURCE}*)+[:=]${UNICODE_LAYOUT_CHARACTER_SOURCE}*`,
  "giu",
);
const EXACT_KEY_LAYOUT_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`${CREDENTIAL_KEY_SOURCE}(${UNICODE_LAYOUT_CHARACTER_SOURCE}*)[:=](${UNICODE_LAYOUT_CHARACTER_SOURCE}*)`,
  "giu",
);
const LAYOUT_AWARE_ASSIGNMENT_PREFIX = new RegExp(
  String.raw`([A-Za-z_$](?:[A-Za-z0-9_$.-]|${UNICODE_LAYOUT_CHARACTER_SOURCE}){0,320})[:=](${UNICODE_LAYOUT_CHARACTER_SOURCE}*)`,
  "giu",
);
const ALL_UNICODE_LAYOUT_CHARACTERS = new RegExp(
  UNICODE_LAYOUT_CHARACTER_SOURCE,
  "gu",
);
const CODE_LAYOUT_SOURCE =
  String.raw`(?:${UNICODE_LAYOUT_CHARACTER_SOURCE}|${CODE_COMMENT_SOURCE})*`;
const OBFUSCATED_ENV_REFERENCES = [
  {
    pattern: new RegExp(
      String.raw`\bprocess${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\[${CODE_LAYOUT_SOURCE}['"\x60]([^'"\x60\r\n]{1,160})['"\x60]${CODE_LAYOUT_SOURCE}\]${CODE_LAYOUT_SOURCE}[:=]${CODE_LAYOUT_SOURCE}`,
      "giu",
    ),
    canonical: /^process[ \t]*\.[ \t]*env[ \t]*\[[ \t\r\n]*(['"`])[^'"`\r\n]{1,160}\1[ \t\r\n]*\][ \t\r\n]*[:=][ \t\r\n]*$/i,
  },
  {
    pattern: new RegExp(
      String.raw`\bprocess${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}([A-Za-z_$][A-Za-z0-9_$.-]{0,159})${CODE_LAYOUT_SOURCE}[:=]${CODE_LAYOUT_SOURCE}`,
      "giu",
    ),
    canonical: /^process[ \t]*\.[ \t]*env[ \t]*\.[ \t]*[A-Za-z_$][A-Za-z0-9_$.-]{0,159}[ \t\r\n]*[:=][ \t\r\n]*$/i,
  },
  {
    pattern: new RegExp(
      String.raw`\bDeno${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}set${CODE_LAYOUT_SOURCE}\(${CODE_LAYOUT_SOURCE}['"\x60]([^'"\x60\r\n]{1,160})['"\x60]${CODE_LAYOUT_SOURCE},${CODE_LAYOUT_SOURCE}`,
      "giu",
    ),
    canonical: /^Deno[ \t]*\.[ \t]*env[ \t]*\.[ \t]*set[ \t]*\([ \t\r\n]*(['"`])[^'"`\r\n]{1,160}\1[ \t\r\n]*,[ \t\r\n]*$/i,
  },
  {
    pattern: new RegExp(
      String.raw`\bDeno${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}get${CODE_LAYOUT_SOURCE}\(${CODE_LAYOUT_SOURCE}['"\x60]([^'"\x60\r\n]{1,160})['"\x60]`,
      "giu",
    ),
    canonical: /^Deno[ \t]*\.[ \t]*env[ \t]*\.[ \t]*get[ \t]*\([ \t\r\n]*(['"`])[^'"`\r\n]{1,160}\1$/i,
  },
  {
    pattern: new RegExp(
      String.raw`\bprocess${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\[${CODE_LAYOUT_SOURCE}['"\x60]([^'"\x60\r\n]{1,160})['"\x60]${CODE_LAYOUT_SOURCE}\]`,
      "giu",
    ),
    canonical: /^process[ \t]*\.[ \t]*env[ \t]*\[[ \t\r\n]*(['"`])[^'"`\r\n]{1,160}\1[ \t\r\n]*\]$/i,
  },
  {
    pattern: new RegExp(
      String.raw`\bprocess${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}env${CODE_LAYOUT_SOURCE}\.${CODE_LAYOUT_SOURCE}([A-Za-z_$][A-Za-z0-9_$.-]{0,159})`,
      "giu",
    ),
    canonical: /^process[ \t]*\.[ \t]*env[ \t]*\.[ \t]*[A-Za-z_$][A-Za-z0-9_$.-]{0,159}$/i,
  },
] as const;

function hasCompleteRedactionValue(value: string) {
  return COMPLETE_REDACTION_VALUE.test(value);
}

function hasNonCanonicalLayout(value: string) {
  const layout = value.match(ALL_UNICODE_LAYOUT_CHARACTERS) || [];
  return layout.some((character) => !/^[ \t\r\n]$/.test(character));
}

function hasUnsupportedSensitiveSyntax(value: string) {
  EXACT_KEY_LAYOUT_ASSIGNMENT_PREFIX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXACT_KEY_LAYOUT_ASSIGNMENT_PREFIX.exec(value)) !== null) {
    const key = String(match[2] || match[3] || "");
    const layout = `${String(match[4] || "")}${String(match[5] || "")}`;
    if (
      hasNonCanonicalLayout(layout) &&
      (isSecretObjectKey(key) || isPiiObjectKey(key))
    ) return true;
  }
  LAYOUT_AWARE_ASSIGNMENT_PREFIX.lastIndex = 0;
  while ((match = LAYOUT_AWARE_ASSIGNMENT_PREFIX.exec(value)) !== null) {
    const renderedKey = String(match[1] || "");
    const postOperatorLayout = String(match[2] || "");
    if (!hasNonCanonicalLayout(`${renderedKey}${postOperatorLayout}`)) {
      continue;
    }
    const reconstructedKey = renderedKey.replace(
      ALL_UNICODE_LAYOUT_CHARACTERS,
      "",
    );
    if (
      isSecretObjectKey(reconstructedKey) || isPiiObjectKey(reconstructedKey)
    ) return true;
  }
  COMMENTED_SENSITIVE_ASSIGNMENT_PREFIX.lastIndex = 0;
  while (
    (match = COMMENTED_SENSITIVE_ASSIGNMENT_PREFIX.exec(value)) !== null
  ) {
    const key = String(match[2] || match[3] || "");
    if (isSecretObjectKey(key) || isPiiObjectKey(key)) return true;
  }
  COMPLEX_TYPED_ASSIGNMENT_PREFIX.lastIndex = 0;
  while ((match = COMPLEX_TYPED_ASSIGNMENT_PREFIX.exec(value)) !== null) {
    const key = String(match[2] || match[3] || "");
    const typeExpression = String(match[4] || "");
    if (
      (isSecretObjectKey(key) || isPiiObjectKey(key)) &&
      (typeExpression.includes(",") || /\/\*|\/\//.test(typeExpression))
    ) return true;
  }
  LINE_SPLIT_AUTHORIZATION_ASSIGNMENT.lastIndex = 0;
  while ((match = LINE_SPLIT_AUTHORIZATION_ASSIGNMENT.exec(value)) !== null) {
    const key = String(match[2] || match[3] || "");
    if (isSecretObjectKey(key)) return true;
  }
  for (const { pattern, canonical } of OBFUSCATED_ENV_REFERENCES) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(value)) !== null) {
      const key = String(match[1] || "");
      if (isSecretObjectKey(key) && !canonical.test(match[0])) return true;
    }
  }
  return false;
}

function redactEnvBracketAssignments(value: string) {
  let redactions = 0;
  ENV_BRACKET_ASSIGNMENT.lastIndex = 0;
  const output = value.replace(
    ENV_BRACKET_ASSIGNMENT,
    (match, prefix, quote, key, suffix) => {
      if (!isSecretObjectKey(String(key || ""))) return match;
      redactions += 1;
      return `${prefix}${quote}${key}${quote}${suffix}"${REDACTED_SECRET}"`;
    },
  );
  return { output, redactions };
}

function redactCredentialAssignments(value: string) {
  let redactions = 0;
  let output = value;
  for (const pattern of CREDENTIAL_ASSIGNMENTS) {
    pattern.lastIndex = 0;
    output = output.replace(
      pattern,
      (match, quote, quotedKey, bareKey, assignmentPrefix) => {
        const key = String(quotedKey || bareKey || "");
        const marker = isSecretObjectKey(key)
          ? REDACTED_SECRET
          : isPiiObjectKey(key)
          ? piiMarkerForKey(key)
          : null;
        if (!marker) return match;
        redactions += 1;
        const renderedKey = quote ? `${quote}${key}${quote}` : key;
        return `${renderedKey}${assignmentPrefix}"${marker}"`;
      },
    );
  }
  return { output, redactions };
}

function redactDenoEnvSetAssignments(value: string) {
  let redactions = 0;
  DENO_ENV_SET_ASSIGNMENT.lastIndex = 0;
  const output = value.replace(
    DENO_ENV_SET_ASSIGNMENT,
    (match, prefix, quote, key, separator) => {
      if (!isSecretObjectKey(String(key || ""))) return match;
      redactions += 1;
      return `${prefix}${quote}${key}${quote}${separator}"${REDACTED_SECRET}"`;
    },
  );
  return { output, redactions };
}

function hasCredentialAssignmentResidue(value: string) {
  for (const pattern of CREDENTIAL_ASSIGNMENTS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const key = String(match[2] || match[3] || "");
      if (isSecretObjectKey(key) || isPiiObjectKey(key)) return true;
    }
  }
  return false;
}

function hasEnvBracketCredentialAssignmentResidue(value: string) {
  ENV_BRACKET_ASSIGNMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENV_BRACKET_ASSIGNMENT.exec(value)) !== null) {
    if (isSecretObjectKey(String(match[3] || ""))) return true;
  }
  return false;
}

function hasDenoEnvSetCredentialAssignmentResidue(value: string) {
  DENO_ENV_SET_ASSIGNMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DENO_ENV_SET_ASSIGNMENT.exec(value)) !== null) {
    if (isSecretObjectKey(String(match[3] || ""))) return true;
  }
  return false;
}

function hasAmbiguousSensitiveAssignmentResidue(value: string) {
  for (const pattern of [
    TYPED_SENSITIVE_ASSIGNMENT_PREFIX,
    DIRECT_SENSITIVE_ASSIGNMENT_PREFIX,
  ]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const key = String(match[2] || match[3] || "");
      if (!isSecretObjectKey(key) && !isPiiObjectKey(key)) continue;
      const tail = value.slice(pattern.lastIndex);
      if (hasCompleteRedactionValue(tail)) continue;
      // The direct prefix also sees the colon at the start of a typed
      // declaration. Accept it only when that declaration ends in a marker.
      if (pattern === DIRECT_SENSITIVE_ASSIGNMENT_PREFIX) {
        const typedTail = tail.match(
          /^[^=;,]{1,160}?[ \t\r\n]*=[ \t\r\n]*/,
        );
        if (
          typedTail &&
          hasCompleteRedactionValue(tail.slice(typedTail[0].length))
        ) continue;
      }
      return true;
    }
  }
  for (const [pattern, keyIndex] of [
    [ENV_BRACKET_ASSIGNMENT_PREFIX, 2],
    [DENO_ENV_SET_ASSIGNMENT_PREFIX, 2],
  ] as const) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const key = String(match[keyIndex] || "");
      if (!isSecretObjectKey(key) && !isPiiObjectKey(key)) continue;
      if (!hasCompleteRedactionValue(value.slice(pattern.lastIndex))) {
        return true;
      }
    }
  }
  return false;
}

const IBAN_CANDIDATE =
  /(?<![A-Z0-9])(?:[A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]){11,30})(?![A-Z0-9])/gi;
const PAYMENT_CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

function validIban(value: string) {
  const compact = value.replace(/[ \t]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validPaymentCard(value: string) {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function redactValidatedFinancialIdentifiers(value: string) {
  let redactions = 0;
  IBAN_CANDIDATE.lastIndex = 0;
  let output = value.replace(IBAN_CANDIDATE, (match) => {
    if (!validIban(match)) return match;
    redactions += 1;
    return REDACTED_FINANCIAL;
  });
  PAYMENT_CARD_CANDIDATE.lastIndex = 0;
  output = output.replace(PAYMENT_CARD_CANDIDATE, (match) => {
    if (!validPaymentCard(match)) return match;
    redactions += 1;
    return REDACTED_FINANCIAL;
  });
  return { output, redactions };
}

function hasValidatedFinancialResidue(value: string) {
  IBAN_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IBAN_CANDIDATE.exec(value)) !== null) {
    if (validIban(match[0])) return true;
  }
  PAYMENT_CARD_CANDIDATE.lastIndex = 0;
  while ((match = PAYMENT_CARD_CANDIDATE.exec(value)) !== null) {
    if (validPaymentCard(match[0])) return true;
  }
  return false;
}

const STRING_REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/gi, REDACTED_SECRET],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, REDACTED_SECRET],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, REDACTED_SECRET],
  [/\bwhsec_[A-Za-z0-9]{16,}\b/g, REDACTED_SECRET],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED_SECRET],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED_SECRET],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, REDACTED_SECRET],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED_SECRET],
  [/(?<![A-Za-z0-9])re_[A-Za-z0-9]{20,}(?![A-Za-z0-9])/g, REDACTED_SECRET],
  [/(?<![A-Za-z0-9])pplx-[A-Za-z0-9]{20,}(?![A-Za-z0-9])/g, REDACTED_SECRET],
  [/(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9])/g, REDACTED_SECRET],
  [/(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9])/g, REDACTED_SECRET],
  [/(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}(?![A-Za-z0-9])/g, REDACTED_SECRET],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED_SECRET],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted-secret]"],
  [/\bBasic\s+[A-Za-z0-9+/=]{4,}/gi, "Basic [redacted-secret]"],
  [/\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted-secret]@"],
  [/\bAccountKey\s*=\s*[^;\s"'`]{8,}/gi, "AccountKey=[redacted-secret]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_EMAIL],
  [/(?<![\w])\+(?=(?:[^\d\r\n]*\d){8,15}(?![\d]))(?:\d[ .()-]{0,3}){7,14}\d(?![\d])/g, REDACTED_PHONE],
  [/\b(?:phone|telephone|tel(?:éfono|efono)?|mobile|m[oó]vil|cell(?:phone)?|celular)[ \t]*[:=#]?[ \t]*(?:\+?\d[ .()-]{0,3}){6,14}\d\b/gi, REDACTED_PHONE],
  [/(?<!\d)[6789]\d{8}(?!\d)/g, REDACTED_PHONE],
  [/(?<!\d)[6789]\d{2}[ .-]\d{3}[ .-]\d{3}(?!\d)/g, REDACTED_PHONE],
  [/(?<!\d)[6789]\d{2}(?:[ .-]\d{2}){3}(?!\d)/g, REDACTED_PHONE],
  [/(?<!\d)[6789]\d{2}\/\d{3}\/\d{3}(?!\d)/g, REDACTED_PHONE],
  [/(?<!\d)0[1-9](?:[ .-]?\d{2}){4}(?!\d)/g, REDACTED_PHONE],
  [/\b\d{8}[A-HJ-NP-TV-Z]\b/gi, REDACTED_IDENTITY],
  [/\b[XYZ]\d{7}[A-Z]\b/gi, REDACTED_IDENTITY],
  [/\b\d{3}-\d{2}-\d{4}\b/g, REDACTED_IDENTITY],
  [/\b(?:passport|pasaporte)(?:[ \t]+(?:number|no\.?|n[uú]mero))?[ \t]*[:=#]?[ \t]*[A-Z0-9]{6,12}\b/gi, REDACTED_IDENTITY],
  [/\b(?:address|direcci[oó]n)[ \t]*[:=][ \t]*[^\r\n,;]{5,120}(?:,[ \t]*[^\r\n,;]{2,60}){0,2}/gi, REDACTED_ADDRESS],
  [/\b(?:calle|avenida|avda\.?|paseo|plaza|ronda|camino|carretera|street|road|avenue|boulevard|lane)[ \t]+[A-Za-zÀ-ÿ0-9 .'-]{2,80}[ \t]*,?[ \t]+\d{1,5}(?:[ \t]*,[ \t]*\d{4,6}[ \t]+[A-Za-zÀ-ÿ .'-]{2,40})?/gi, REDACTED_ADDRESS],
  [/\b\d{1,5}[A-Za-z]?[ \t]+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{2,60}[ \t]+(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?)(?:[ \t]*,[ \t]*[A-Za-zÀ-ÿ0-9 .'-]{2,60})?/gi, REDACTED_ADDRESS],
];

const UNSAFE_RESIDUE = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /(?<![A-Za-z0-9])re_[A-Za-z0-9]{20,}(?![A-Za-z0-9])/,
  /(?<![A-Za-z0-9])pplx-[A-Za-z0-9]{20,}(?![A-Za-z0-9])/,
  /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9])/,
  /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9])/,
  /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}(?![A-Za-z0-9])/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bBasic\s+[A-Za-z0-9+/=]{4,}/i,
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/@:]+:[^\s/@]+@/i,
  /\bAccountKey[ \t]*=[ \t]*[^;\s"'`]{8,}/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?<![\w])\+(?=(?:[^\d\r\n]*\d){8,15}(?![\d]))(?:\d[ .()-]{0,3}){7,14}\d(?![\d])/,
  /\b(?:phone|telephone|tel(?:éfono|efono)?|mobile|m[oó]vil|cell(?:phone)?|celular)[ \t]*[:=#]?[ \t]*(?:\+?\d[ .()-]{0,3}){6,14}\d\b/i,
  /(?<!\d)[6789]\d{8}(?!\d)/,
  /(?<!\d)[6789]\d{2}[ .-]\d{3}[ .-]\d{3}(?!\d)/,
  /(?<!\d)[6789]\d{2}(?:[ .-]\d{2}){3}(?!\d)/,
  /(?<!\d)[6789]\d{2}\/\d{3}\/\d{3}(?!\d)/,
  /(?<!\d)0[1-9](?:[ .-]?\d{2}){4}(?!\d)/,
  /\b\d{8}[A-HJ-NP-TV-Z]\b/i,
  /\b[XYZ]\d{7}[A-Z]\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:passport|pasaporte)(?:[ \t]+(?:number|no\.?|n[uú]mero))?[ \t]*[:=#]?[ \t]*[A-Z0-9]{6,12}\b/i,
  /\b(?:address|direcci[oó]n)[ \t]*[:=][ \t]*[^\r\n,;]{5,120}(?:,[ \t]*[^\r\n,;]{2,60}){0,2}/i,
  /\b(?:calle|avenida|avda\.?|paseo|plaza|ronda|camino|carretera|street|road|avenue|boulevard|lane)[ \t]+[A-Za-zÀ-ÿ0-9 .'-]{2,80}[ \t]*,?[ \t]+\d{1,5}(?:[ \t]*,[ \t]*\d{4,6}[ \t]+[A-Za-zÀ-ÿ .'-]{2,40})?/i,
  /\b\d{1,5}[A-Za-z]?[ \t]+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'-]{2,60}[ \t]+(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?)(?:[ \t]*,[ \t]*[A-Za-zÀ-ÿ0-9 .'-]{2,60})?/i,
];

function sanitizeCommercialString(value: string) {
  if (hasUnsupportedSensitiveSyntax(value)) {
    return { ok: false as const, issue: "UNSAFE_RESIDUE" as const };
  }
  let output = value;
  let redactions = 0;
  const bracketAssignments = redactEnvBracketAssignments(output);
  output = bracketAssignments.output;
  redactions += bracketAssignments.redactions;
  const denoAssignments = redactDenoEnvSetAssignments(output);
  output = denoAssignments.output;
  redactions += denoAssignments.redactions;
  const assignments = redactCredentialAssignments(output);
  output = assignments.output;
  redactions += assignments.redactions;
  const financialIdentifiers = redactValidatedFinancialIdentifiers(output);
  output = financialIdentifiers.output;
  redactions += financialIdentifiers.redactions;
  for (const [pattern, replacement] of STRING_REDACTIONS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (...args: any[]) => {
      redactions += 1;
      return replacement.replaceAll("$1", String(args[1] || ""));
    });
  }
  const residueCandidate = output
    .replaceAll(REDACTED_SECRET, "")
    .replaceAll(REDACTED_EMAIL, "")
    .replaceAll(REDACTED_PHONE, "")
    .replaceAll(REDACTED_IDENTITY, "")
    .replaceAll(REDACTED_ADDRESS, "")
    .replaceAll(REDACTED_FINANCIAL, "")
    .replaceAll(REDACTED_PII, "");
  if (UNSAFE_RESIDUE.some((pattern) => pattern.test(residueCandidate))) {
    return { ok: false as const, issue: "UNSAFE_RESIDUE" as const };
  }
  if (hasValidatedFinancialResidue(residueCandidate)) {
    return { ok: false as const, issue: "UNSAFE_RESIDUE" as const };
  }
  if (
    hasCredentialAssignmentResidue(output) ||
    hasEnvBracketCredentialAssignmentResidue(output) ||
    hasDenoEnvSetCredentialAssignmentResidue(output) ||
    hasAmbiguousSensitiveAssignmentResidue(output)
  ) {
    return { ok: false as const, issue: "UNSAFE_RESIDUE" as const };
  }
  return { ok: true as const, value: output, redactions };
}

/**
 * Bounded deep-copy sanitizer. Limits never truncate: exceeding any limit is
 * a review-required failure, so no partial or silently altered payload leaves.
 */
export function sanitizeCommercialEgress(
  value: unknown,
  limits: CommercialEgressLimits = COMMERCIAL_PROVIDER_INPUT_LIMITS,
): CommercialEgressSanitization {
  const seen = new WeakSet<object>();
  let redactions = 0;
  let estimatedBytes = 0;
  let issue: SanitizationIssue | null = null;

  const walk = (current: unknown, depth: number): unknown => {
    if (issue) return null;
    if (depth > limits.maxDepth) {
      issue = "DEPTH_LIMIT";
      return null;
    }
    if (current === null || typeof current === "boolean") {
      estimatedBytes += current === null ? 4 : current ? 4 : 5;
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        issue = "UNSUPPORTED_VALUE";
        return null;
      }
      estimatedBytes += String(current).length;
      return current;
    }
    if (typeof current === "string") {
      const bytes = byteLength(current);
      if (bytes > limits.maxStringBytes) {
        issue = "STRING_LIMIT";
        return null;
      }
      const sanitized = sanitizeCommercialString(current);
      if (!sanitized.ok) {
        issue = sanitized.issue;
        return null;
      }
      redactions += sanitized.redactions;
      estimatedBytes += byteLength(sanitized.value);
      if (estimatedBytes > limits.maxTotalBytes) issue = "TOTAL_LIMIT";
      return sanitized.value;
    }
    if (typeof current !== "object") {
      issue = "UNSUPPORTED_VALUE";
      return null;
    }
    if (seen.has(current as object)) {
      issue = "CIRCULAR_VALUE";
      return null;
    }
    seen.add(current as object);
    if (Array.isArray(current)) {
      if (current.length > limits.maxArrayItems) {
        issue = "ARRAY_LIMIT";
        return null;
      }
      return current.map((child) => walk(child, depth + 1));
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      issue = "UNSUPPORTED_VALUE";
      return null;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    if (entries.length > limits.maxObjectKeys) {
      issue = "OBJECT_LIMIT";
      return null;
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      if (
        !SAFE_OBJECT_KEY.test(key) || byteLength(key) > 160 ||
        DANGEROUS_OBJECT_KEYS.has(key.toLowerCase())
      ) {
        issue = "KEY_LIMIT";
        return null;
      }
      estimatedBytes += byteLength(key);
      if (isSecretObjectKey(key)) {
        walk(child, depth + 1);
        if (issue) return null;
        output[key] = REDACTED_SECRET;
        redactions += 1;
      } else if (isPiiObjectKey(key)) {
        walk(child, depth + 1);
        if (issue) return null;
        output[key] = piiMarkerForKey(key);
        redactions += 1;
      } else {
        output[key] = walk(child, depth + 1);
      }
    }
    return output;
  };

  const sanitized = walk(value, 0);
  if (issue) return { ok: false, issue };
  let serialized: string;
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    return { ok: false, issue: "UNSUPPORTED_VALUE" };
  }
  const bytes = byteLength(serialized);
  if (bytes > limits.maxTotalBytes) return { ok: false, issue: "TOTAL_LIMIT" };
  return { ok: true, value: sanitized, bytes, redactions };
}

export function requireSanitizedCommercialOutput(value: unknown) {
  const sanitized = sanitizeCommercialEgress(
    value,
    COMMERCIAL_PROVIDER_OUTPUT_LIMITS,
  );
  if (!sanitized.ok) {
    throw protectedCommercialReviewError(
      COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED,
    );
  }
  return sanitized.value;
}

// Mirror (and intentionally exceed) AgentTask's immutable redaction boundary.
// Removing these keys before settlement keeps task/result/outbox projections
// canonically identical without weakening the generic AgentTask sanitizer.
const AGENT_TASK_SENSITIVE_KEY =
  /(secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key|credential)/i;

function withoutCommercialSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCommercialSensitiveKeys);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretObjectKey(key) || AGENT_TASK_SENSITIVE_KEY.test(key)) continue;
    output[key] = withoutCommercialSensitiveKeys(child);
  }
  return output;
}

/**
 * One executable binding for every persistence surface that can receive model
 * output. Handlers spread these exact objects into the AgentTask patch and
 * terminal outbox input, so no unsanitized sibling payload can drift in.
 */
export function protectedCommercialPersistenceBindings(
  source: ProtectedAnthropicSource,
  value: unknown,
) {
  if (!PROTECTED_ANTHROPIC_SOURCE_PURPOSES[source]) {
    throw protectedCommercialReviewError(
      COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED,
    );
  }
  const sanitized = requireSanitizedCommercialOutput(value);
  const payload = requireSanitizedCommercialOutput(
    withoutCommercialSensitiveKeys(sanitized),
  );
  return {
    payload,
    taskPatch: { output_payload_json: payload },
    terminal: {
      result: payload,
      terminalEvent: {
        eventType: "agent.task.terminal",
        source,
        payload,
      },
    },
  } as const;
}

/** Strict parser for the three structured findings agents. No substring
 * recovery: malformed or decorated provider text must remain review-required.
 */
export function parseCommercialFindingsJson(value: unknown) {
  if (typeof value !== "string" || byteLength(value) > 32_000) return null;
  let candidate = value.trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) candidate = fenced[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (
    !parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
    !Array.isArray((parsed as any).findings)
  ) return null;
  return parsed as Record<string, any> & { findings: any[] };
}

/** Exact provider schema for code/security review; limits are reject-only. */
export function normalizeCommercialCodeSnippets(value: unknown) {
  if (!Array.isArray(value) || value.length > 10) return null;
  const shaped: Array<{ file: string; content: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const suppliedFile = (entry as any).file;
    if (suppliedFile !== undefined && suppliedFile !== null && typeof suppliedFile !== "string") {
      return null;
    }
    const file = suppliedFile || "unknown";
    const content = (entry as any).content;
    if (
      typeof content !== "string" || byteLength(content) > 4_000 ||
      byteLength(file) > 240
    ) return null;
    shaped.push({ file, content });
  }
  const sanitized = sanitizeCommercialEgress(shaped);
  return sanitized.ok ? sanitized.value as Array<{ file: string; content: string }> : null;
}

const PUBLIC_COMMERCIAL_ERROR_CODES = new Set([
  "commercial_anthropic_egress_policy_review_required",
  "commercial_egress_input_review_required",
  "commercial_egress_output_review_required",
  "commercial_inference_evidence_review_required",
  "commercial_inference_post_effect_review_required",
  "provider_effect_review_required",
  "provider_receipt_review_required",
  "provider_output_review_required",
  "cost_reservation_review_required",
  "cost_settlement_review_required",
  "emergency_effect_ambiguous",
  "code_review_response_invalid",
  "security_review_response_invalid",
  "qa_monitor_response_invalid",
  "founder_copilot_source_coverage_incomplete",
  "qa_agent_source_coverage_incomplete",
  "qa_monitor_source_coverage_incomplete",
  "code_review_failed",
  "founder_copilot_failed",
  "qa_agent_failed",
  "qa_monitor_failed",
  "security_review_failed",
  "spend_intelligence_review_required",
  "commercial_operation_failed",
]);

/** Never expose or persist Error.message/provider bodies. */
export function stableCommercialPublicErrorCode(
  error: any,
  fallback: string,
) {
  const candidate = typeof error?.code === "string"
    ? error.code.trim().toLowerCase()
    : "";
  const safeFallback = String(fallback || "commercial_operation_failed")
    .trim().toLowerCase();
  if (PUBLIC_COMMERCIAL_ERROR_CODES.has(candidate)) return candidate;
  return PUBLIC_COMMERCIAL_ERROR_CODES.has(safeFallback)
    ? safeFallback
    : "commercial_operation_failed";
}

export function protectedCommercialErrorResponse(
  error: any,
  operation: string,
  fallback: string,
  postEffect = false,
) {
  const explicitlyReviewRequired = Number(error?.status) === 409 &&
    (error?.review_required === true || error?.automatic_retry_blocked === true);
  const reviewRequired = explicitlyReviewRequired || postEffect;
  const code = postEffect && !explicitlyReviewRequired
    ? "commercial_inference_post_effect_review_required"
    : stableCommercialPublicErrorCode(error, fallback);
  const requestId = crypto.randomUUID();
  const status = reviewRequired ? 409 : 500;
  const log = {
    level: reviewRequired ? "warning" : "error",
    event: "protected_commercial_operation_error",
    operation: String(operation).slice(0, 80),
    request_id: requestId,
    status,
    code,
  };
  (reviewRequired ? console.warn : console.error)(JSON.stringify(log));
  return Response.json({
    ok: false,
    error: code,
    request_id: requestId,
    ...(reviewRequired
      ? { review_required: true, automatic_retry_blocked: true }
      : {}),
  }, { status });
}

/**
 * Best-effort boundary for the five protected handlers. The raw error is used
 * only for allowlist matching; message, cause, stack and provider body never
 * enter the log record.
 */
export function protectedCommercialBestEffort<T>(
  error: any,
  options: {
    operation: string;
    code: string;
    fallback: T;
    severity?: "secondary" | "critical";
  },
): T {
  const requestId = crypto.randomUUID();
  const code = stableCommercialPublicErrorCode(error, options.code);
  const severity = options.severity === "critical" ? "critical" : "secondary";
  console.warn(JSON.stringify({
    level: severity === "critical" ? "error" : "warning",
    event: "protected_commercial_best_effort",
    operation: String(options.operation).slice(0, 80),
    request_id: requestId,
    code,
    severity,
  }));
  return options.fallback;
}

const FAILURE_CATEGORIES = [
  "AUTHORIZATION",
  "CONFLICT",
  "DATA_ACCESS",
  "POLICY",
  "PROVIDER",
  "RATE_LIMIT",
  "TIMEOUT",
  "VALIDATION",
  "UNCLASSIFIED",
] as const;
type FailureCategory = typeof FAILURE_CATEGORIES[number];

function failureCategory(value: unknown): FailureCategory {
  const text = String(value || "").toLowerCase();
  if (/unauth|forbidden|permission|access denied/.test(text)) return "AUTHORIZATION";
  if (/rate.?limit|too many requests|429/.test(text)) return "RATE_LIMIT";
  if (/timeout|timed out|deadline|abort/.test(text)) return "TIMEOUT";
  if (/conflict|already exists|duplicate|idempot/.test(text)) return "CONFLICT";
  if (/database|entity|query|read|write|storage/.test(text)) return "DATA_ACCESS";
  if (/policy|approval|consent|egress/.test(text)) return "POLICY";
  if (/provider|anthropic|stripe|resend|webhook/.test(text)) return "PROVIDER";
  if (/invalid|validation|required|malformed|parse/.test(text)) return "VALIDATION";
  return "UNCLASSIFIED";
}

const COMPONENT_CATEGORIES = [
  "BILLING",
  "COMMERCIAL",
  "DATA",
  "INTEGRATION",
  "QA",
  "SECURITY",
  "UNCLASSIFIED",
] as const;
type ComponentCategory = typeof COMPONENT_CATEGORIES[number];

function componentCategory(value: unknown): ComponentCategory {
  const text = String(value || "").toLowerCase();
  if (/bill|invoice|payment|spend|cost|saving/.test(text)) return "BILLING";
  if (/commercial|lead|outreach|founder|copilot|sales/.test(text)) return "COMMERCIAL";
  if (/data|entity|backup|restore|migration/.test(text)) return "DATA";
  if (/provider|webhook|connector|integration|sync/.test(text)) return "INTEGRATION";
  if (/qa|test|quality/.test(text)) return "QA";
  if (/security|gdpr|legal|compliance/.test(text)) return "SECURITY";
  return "UNCLASSIFIED";
}

function incrementBucket(
  buckets: Map<string, { component_category: ComponentCategory; error_category: FailureCategory; count: number }>,
  component: ComponentCategory,
  error: FailureCategory,
) {
  const key = `${component}:${error}`;
  const current = buckets.get(key) || {
    component_category: component,
    error_category: error,
    count: 0,
  };
  current.count += 1;
  buckets.set(key, current);
}

/** Provider-safe QA aggregation: fixed enums and counts, never raw messages. */
export function shapeQaMonitorProviderSignals(
  failedTasks: any[],
  failedEvents: any[],
) {
  const taskBuckets = new Map();
  for (const task of Array.isArray(failedTasks) ? failedTasks : []) {
    incrementBucket(
      taskBuckets,
      componentCategory(`${task?.agent_name || ""} ${task?.task_type || ""}`),
      failureCategory(task?.error),
    );
  }
  const eventBuckets = new Map();
  for (const event of Array.isArray(failedEvents) ? failedEvents : []) {
    incrementBucket(
      eventBuckets,
      componentCategory(`${event?.source || ""} ${event?.event_type || ""}`),
      failureCategory(`${event?.event_type || ""} ${event?.error || ""}`),
    );
  }
  const sortBuckets = (values: any[]) => values.sort((left, right) =>
    right.count - left.count ||
    left.component_category.localeCompare(right.component_category) ||
    left.error_category.localeCompare(right.error_category)
  );
  return {
    failed_task_count: Array.isArray(failedTasks) ? failedTasks.length : 0,
    failed_event_count: Array.isArray(failedEvents) ? failedEvents.length : 0,
    failed_task_buckets: sortBuckets([...taskBuckets.values()]),
    failed_event_buckets: sortBuckets([...eventBuckets.values()]),
  };
}

export function shapeFailureProviderSignals(rows: any[]) {
  const shaped = shapeQaMonitorProviderSignals(rows, []);
  return shaped.failed_task_buckets;
}

export const QA_FLOW_ALLOWLIST = Object.freeze([
  "analyzer_run",
  "stripe_connect",
  "deal_activation",
  "savings_report",
]);

export function normalizeAllowedQaFlows(value: unknown) {
  const supplied = Array.isArray(value) && value.length ? value : QA_FLOW_ALLOWLIST;
  if (supplied.length > QA_FLOW_ALLOWLIST.length) return null;
  const normalized = supplied.map((entry) => String(entry || "").trim());
  if (normalized.some((entry) => !QA_FLOW_ALLOWLIST.includes(entry))) return null;
  return [...new Set(normalized)];
}
