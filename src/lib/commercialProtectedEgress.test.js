import { describe, expect, it, vi } from "vitest";
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  COMMERCIAL_PROVIDER_INPUT_LIMITS,
  executeWithObservedAnthropicEgress,
  normalizeCommercialCodeSnippets,
  normalizeAllowedQaFlows,
  parseCommercialFindingsJson,
  protectedCommercialBestEffort,
  protectedCommercialErrorResponse,
  protectedCommercialPersistenceBindings,
  requireSanitizedCommercialOutput,
  resolveObservedAnthropicEgressPolicy,
  sanitizeCommercialEgress,
  shapeQaMonitorProviderSignals,
  stableCommercialPublicErrorCode,
} from "../../base44/shared/commercialProtectedEgress.ts";

const PURPOSE = "admin_requested_code_review";
const NOW = new Date("2026-08-21T12:00:00.000Z");

function policyEnvironment(overrides = {}) {
  const values = {
    CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS: "APPROVED",
    CAMBRA_ANTHROPIC_EGRESS_POLICY_ID: "anthropic-egress-policy-2026-08",
    CAMBRA_ANTHROPIC_EGRESS_POLICY_SHA256: "a".repeat(64),
    CAMBRA_ANTHROPIC_EGRESS_POLICY_PURPOSES:
      "admin_requested_code_review,admin_requested_security_review",
    CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
  return (name) => values[name];
}

describe("protected commercial Anthropic egress", () => {
  it("accepts only explicit, observed, purpose-bound and unexpired policy evidence", () => {
    const valid = resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment(),
      now: NOW,
    });
    expect(valid).toMatchObject({
      ok: true,
      evidence: {
        status: "OBSERVED",
        policy_id: "anthropic-egress-policy-2026-08",
        policy_hash: "a".repeat(64),
        purpose: PURPOSE,
        expires_at: "2026-09-01T00:00:00.000Z",
      },
    });

    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS: "UNKNOWN" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "STATUS_NOT_APPROVED" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_PURPOSES: "admin_requested_security_review" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "PURPOSE_NOT_ALLOWED" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: "2026-08-21T11:59:59.000Z" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "POLICY_EXPIRED" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: undefined }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "EXPIRY_REQUIRED" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: "2026-09-01T00:00:00+00:00" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "EXPIRY_INVALID" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: "2026-09-01T00:00:00" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "EXPIRY_INVALID" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_SHA256: "not-a-hash" }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "POLICY_HASH_INVALID" });
    expect(resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_ID: ["sk", "-ant-", "abcdefghijklmnop1234"].join("") }),
      now: NOW,
    })).toMatchObject({ ok: false, reason: "POLICY_ID_INVALID" });
  });

  it("never invokes the provider callback when deployment policy is absent or mismatched", async () => {
    const valid = resolveObservedAnthropicEgressPolicy(PURPOSE, {
      getEnv: policyEnvironment(),
      now: NOW,
    });
    expect(valid.ok).toBe(true);
    const provider = vi.fn(async () => "called");

    await expect(executeWithObservedAnthropicEgress({
      source: "codeReviewAgent",
      purpose: PURPOSE,
      policy: valid.evidence,
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS: undefined }),
      now: NOW,
    }, provider)).rejects.toMatchObject({
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      status: 409,
      automatic_retry_blocked: true,
    });
    expect(provider).not.toHaveBeenCalled();

    await expect(executeWithObservedAnthropicEgress({
      source: "codeReviewAgent",
      purpose: PURPOSE,
      policy: { ...valid.evidence, policy_hash: "b".repeat(64) },
      getEnv: policyEnvironment(),
      now: NOW,
    }, provider)).rejects.toMatchObject({
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
    });
    expect(provider).not.toHaveBeenCalled();

    await expect(executeWithObservedAnthropicEgress({
      source: "codeReviewAgent",
      purpose: PURPOSE,
      policy: valid.evidence,
      getEnv: policyEnvironment({ CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT: "2026-08-21T11:59:59.000Z" }),
      now: NOW,
    }, provider)).rejects.toMatchObject({
      code: COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      status: 409,
      automatic_retry_blocked: true,
    });
    expect(provider).not.toHaveBeenCalled();

    await expect(executeWithObservedAnthropicEgress({
      source: "codeReviewAgent",
      purpose: PURPOSE,
      policy: valid.evidence,
      getEnv: policyEnvironment(),
      now: NOW,
    }, provider)).resolves.toBe("called");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("redacts email and high-confidence credentials embedded in code and objects", () => {
    const email = ["founder", "@", "example.com"].join("");
    const githubCredential = ["gh", "p_", "123456789012345678901234567890123456"].join("");
    const openAiCredential = ["sk", "-proj-", "abcdefghijklmnopqrstuvwxyz012345"].join("");
    const anthropicCredential = ["sk", "-ant-", "abcdefghijklmnopqrstuvwxyz012345"].join("");
    const stripeCredential = ["sk", "_live_", "123456789012345678901234"].join("");
    const awsCredential = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
    const resendCredential = ["r", "e_", "R".repeat(24)].join("");
    const perplexityCredential = ["pp", "lx-", "P".repeat(24)].join("");
    const googleCredential = ["AI", "za", "G".repeat(35)].join("");
    const slackCredential = ["xo", "xb-", "S".repeat(24)].join("");
    const sendGridCredential = ["S", "G.", "T".repeat(24), ".", "U".repeat(24)].join("");
    const databaseUri = ["postgres://root:", "database-password", "@example.invalid:5432/db"].join("");
    const internationalPhone = ["+34", " (612) 345 678"].join("");
    const dni = ["1234567", "8Z"].join("");
    const nie = ["X123456", "7L"].join("");
    const passport = ["passport number: AB", "1234567"].join("");
    const postalAddress = ["Calle Serrano", ", 55, 28006 Madrid"].join("");
    const englishPostalAddress = ["221B Baker", " Street, London NW1"].join("");
    const oneCharacterSchemeUri = ["x://user:", "uri-password", "@localhost/resource"].join("");
    const localPhone = ["612", " 345", " 678"].join("");
    const labelledLocalPhone = ["phone: ", "612345678"].join("");
    const spanishPlainPhone = ["612", "345", "678"].join("");
    const spanishGroupedPhone = ["612", " 34", " 56", " 78"].join("");
    const spanishSlashPhone = ["612", "/345", "/678"].join("");
    const frenchLocalPhone = ["06", " 12", " 34", " 56", " 78"].join("");
    const iban = ["ES91", " 2100 0418 4502 0005 1332"].join("");
    const paymentCard = ["4111", " 1111 1111 1111"].join("");
    const ssn = ["123", "-45-", "6789"].join("");
    const input = {
      contact: email,
      x_api_key: "top-secret-x-api-key",
      api_token: "top-secret-api-token",
      token: "top-secret-generic-token",
      session_token: "top-secret-session-token",
      id_token: "top-secret-id-token",
      aws_secret_access_key: "top-secret-aws-access-key",
      ANTHROPIC_API_KEY: "top-secret-anthropic-key",
      GITHUB_TOKEN: "top-secret-github-token",
      STRIPE_SECRET_KEY: "top-secret-stripe-key",
      DATABASE_PASSWORD: "top-secret-database-password",
      CAMBRA_CLIENT_SECRET: "top-secret-cambra-client-secret",
      auth: "raw-structured-auth-value",
      metadata: { build_auth_context: "raw-tokenized-auth-value" },
      profile: {
        phone_number: "local-unformatted-number",
        customer_phone_primary: "raw-tokenized-phone-value",
        email_address: "opaque-email-identifier",
        national_id: "opaque-national-identifier",
        postal_address: { line: "opaque-address-line" },
        iban: "opaque-bank-identifier",
      },
      code: [
        `const github = '${githubCredential}';`,
        `const openai = '${openAiCredential}';`,
        `const anthropic = '${anthropicCredential}';`,
        `const stripe = '${stripeCredential}';`,
        `const aws = '${awsCredential}';`,
        `const opaqueOne = '${resendCredential}';`,
        `const opaqueTwo = '${perplexityCredential}';`,
        `const opaqueThree = '${googleCredential}';`,
        `const opaqueFour = '${slackCredential}';`,
        `const opaqueFive = '${sendGridCredential}';`,
        "api_token = very-secret-api-token-value",
        "x-api-key: very-secret-x-api-key-value",
        "aws_session_token=very-secret-aws-session-value",
        ["AWS_SECRET_ACCESS_KEY=", "very-secret-aws-access-assignment"].join(""),
        "process.env.ANTHROPIC_API_KEY = 'very-secret-process-value'",
        "process.env['ANTHROPIC_API_KEY'] = 'very-secret-bracket-value'",
        "process.env[`GITHUB_TOKEN`] = 'very-secret-template-bracket-value'",
        "authorization=Bearer very-secret-authorization-value",
        "GITHUB_TOKEN=very-secret-github-assignment",
        "STRIPE_SECRET_KEY: very-secret-stripe-assignment",
        "DATABASE_PASSWORD='very-secret-database-assignment'",
        "CAMBRA_CLIENT_SECRET=`very-secret-cambra-assignment`",
        ["api_token", "\n=\n", "'very-secret-multiline-value'"].join(""),
        ["const apiKey: Promise<string>", "\n=\n", "'very-secret-typed-value'"].join(""),
        ["Deno.env.set(\n'ANTHROPIC_API_KEY',\n", "'very-secret-deno-value'", "\n)"].join(""),
        databaseUri,
        ["amqps://admin:", "s3cr3t", "@10.0.0.1"].join(""),
        ["https://user:", "password", "@localhost"].join(""),
        oneCharacterSchemeUri,
        internationalPhone,
        localPhone,
        labelledLocalPhone,
        spanishPlainPhone,
        spanishGroupedPhone,
        spanishSlashPhone,
        frenchLocalPhone,
        dni,
        nie,
        passport,
        postalAddress,
        englishPostalAddress,
        iban,
        paymentCard,
        ssn,
        "-----BEGIN ENCRYPTED PRIVATE KEY-----\nvery-secret-private-key-material\n-----END ENCRYPTED PRIVATE KEY-----",
      ].join("\n"),
    };
    const sanitized = sanitizeCommercialEgress(input);
    expect(sanitized.ok).toBe(true);
    const serialized = JSON.stringify(sanitized.value);
    expect(serialized).not.toContain(email);
    expect(serialized).not.toContain(githubCredential);
    expect(serialized).not.toContain("sk-proj-");
    expect(serialized).not.toContain("sk-ant-");
    expect(serialized).not.toContain("sk_live_");
    expect(serialized).not.toContain(awsCredential);
    expect(serialized).not.toContain(resendCredential);
    expect(serialized).not.toContain(perplexityCredential);
    expect(serialized).not.toContain(googleCredential);
    expect(serialized).not.toContain(slackCredential);
    expect(serialized).not.toContain(sendGridCredential);
    expect(serialized).not.toContain("database-password");
    expect(serialized).not.toContain("very-secret");
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("PRIVATE KEY-----");
    expect(serialized).not.toContain("$1");
    expect(serialized).toContain("api_token = \\\"[redacted-secret]\\\"");
    expect(serialized).toContain("x-api-key: \\\"[redacted-secret]\\\"");
    expect(serialized).toContain("aws_session_token=\\\"[redacted-secret]\\\"");
    expect(serialized).toContain("process.env.ANTHROPIC_API_KEY = \\\"[redacted-secret]\\\"");
    expect(serialized).not.toContain("s3cr3t");
    expect(serialized).not.toContain("https://user:password@");
    expect(serialized).not.toContain(oneCharacterSchemeUri);
    expect(serialized).not.toContain("very-secret-bracket-value");
    expect(serialized).not.toContain("very-secret-authorization-value");
    expect(serialized).not.toContain(internationalPhone);
    expect(serialized).not.toContain(localPhone);
    expect(serialized).not.toContain(labelledLocalPhone);
    expect(serialized).not.toContain(spanishPlainPhone);
    expect(serialized).not.toContain(spanishGroupedPhone);
    expect(serialized).not.toContain(spanishSlashPhone);
    expect(serialized).not.toContain(frenchLocalPhone);
    expect(serialized).not.toContain("raw-structured-auth-value");
    expect(serialized).not.toContain("raw-tokenized-auth-value");
    expect(serialized).not.toContain("raw-tokenized-phone-value");
    expect(serialized).not.toContain(dni);
    expect(serialized).not.toContain(nie);
    expect(serialized).not.toContain(passport);
    expect(serialized).not.toContain(postalAddress);
    expect(serialized).not.toContain(englishPostalAddress);
    expect(serialized).not.toContain(iban);
    expect(serialized).not.toContain(paymentCard);
    expect(serialized).not.toContain(ssn);
    expect(serialized).toContain("[redacted-phone]");
    expect(serialized).toContain("[redacted-identity]");
    expect(serialized).toContain("[redacted-address]");
    expect(serialized).toContain("[redacted-financial]");
    expect(sanitized.value).toMatchObject({
      ANTHROPIC_API_KEY: "[redacted-secret]",
      GITHUB_TOKEN: "[redacted-secret]",
      STRIPE_SECRET_KEY: "[redacted-secret]",
      DATABASE_PASSWORD: "[redacted-secret]",
      CAMBRA_CLIENT_SECRET: "[redacted-secret]",
      auth: "[redacted-secret]",
      metadata: { build_auth_context: "[redacted-secret]" },
      profile: {
        phone_number: "[redacted-phone]",
        customer_phone_primary: "[redacted-phone]",
        email_address: "[redacted-email]",
        national_id: "[redacted-identity]",
        postal_address: "[redacted-address]",
        iban: "[redacted-financial]",
      },
    });
    expect(sanitized.redactions).toBeGreaterThanOrEqual(50);
    const secondPass = sanitizeCommercialEgress(sanitized.value);
    expect(secondPass.ok).toBe(true);
    expect(secondPass.value).toEqual(sanitized.value);
  });

  it("fails closed instead of truncating strings, arrays, depth or total bytes", () => {
    expect(sanitizeCommercialEgress([
      "-----BEGIN ", "PRIVATE KEY-----\n", "unterminated-material",
    ].join(""))).toEqual({ ok: false, issue: "UNSAFE_RESIDUE" });
    expect(sanitizeCommercialEgress([
      "const apiKey: string = '", "unterminated sensitive value",
    ].join(""))).toEqual({ ok: false, issue: "UNSAFE_RESIDUE" });
    const ambiguousValue = "raw-ambiguous-value";
    const nonCanonicalLayouts = [
      "\u0000",
      "\u000b",
      "\u000c",
      "\u0085",
      "\u00a0",
      "\u1680",
      "\u2007",
      "\u200b",
      "\u200e",
      "\u200f",
      "\u2028",
      "\u2029",
      "\u202f",
      "\u205f",
      "\u2060",
      "\u3000",
      "\ufeff",
    ];
    for (const layout of nonCanonicalLayouts) {
      for (const unsafeSyntax of [
        ["const apiKey", layout, "= '", ambiguousValue, "'"].join(""),
        ["const api", layout, "Key = '", ambiguousValue, "'"].join(""),
        ["auth=", layout, "'", ambiguousValue, "'"].join(""),
        ["'api_key'", layout, ": '", ambiguousValue, "'"].join(""),
        ["process.env['ANTHROPIC_API_KEY']", layout, "= '", ambiguousValue, "'"].join(""),
        ["Deno.env.set('ANTHROPIC_API_KEY',", layout, "'", ambiguousValue, "')"].join(""),
      ]) {
        expect(sanitizeCommercialEgress(unsafeSyntax)).toEqual({
          ok: false,
          issue: "UNSAFE_RESIDUE",
        });
      }
    }
    for (const unsafeSyntax of [
      ["const apiKey: Record<string,string> = '", ambiguousValue, "'"].join(""),
      ["Deno.env.set( /* comment */ 'ANTHROPIC_API_KEY', '", ambiguousValue, "')"].join(""),
      ["Deno.env.set( /*", "x".repeat(600), "*/ 'ANTHROPIC_API_KEY', '", ambiguousValue, "')"].join(""),
      ["Deno.env /* comment */ .set('ANTHROPIC_API_KEY', '", ambiguousValue, "')"].join(""),
      ["process /* comment */ . env ['ANTHROPIC_API_KEY'] = '", ambiguousValue, "'"].join(""),
      ["process.env.ANTHROPIC_API_KEY /* comment */ = '", ambiguousValue, "'"].join(""),
      ["process.env['ANTHROPIC_API_KEY'] /* comment */ = '", ambiguousValue, "'"].join(""),
      ["process\n.\nenv\n.\nANTHROPIC_API_KEY\n=\n'", ambiguousValue, "'"].join(""),
      ["authorization=Bearer\n", ambiguousValue].join(""),
      ["authorization=\nBearer ", ambiguousValue].join(""),
      ["authorization /* comment */ = '", ambiguousValue, "'"].join(""),
      ["auth // comment\n : '", ambiguousValue, "'"].join(""),
      ["const apiKey /* comment\n across lines */ = '", ambiguousValue, "'"].join(""),
      ["({ nested: { auth /* first */ /* second */ : '", ambiguousValue, "' } })"].join(""),
      ["api_key=\"[redacted-secret]", ambiguousValue, "\""].join(""),
    ]) {
      expect(sanitizeCommercialEgress(unsafeSyntax)).toEqual({
        ok: false,
        issue: "UNSAFE_RESIDUE",
      });
    }
    expect(sanitizeCommercialEgress('api_key="[redacted-secret]";'))
      .toMatchObject({ ok: true, value: 'api_key="[redacted-secret]";' });
    expect(sanitizeCommercialEgress("x".repeat(
      COMMERCIAL_PROVIDER_INPUT_LIMITS.maxStringBytes + 1,
    ))).toEqual({ ok: false, issue: "STRING_LIMIT" });
    expect(sanitizeCommercialEgress(Array.from({ length: 51 }, () => 1)))
      .toEqual({ ok: false, issue: "ARRAY_LIMIT" });
    expect(sanitizeCommercialEgress(JSON.parse('{"__proto__":"blocked"}')))
      .toEqual({ ok: false, issue: "KEY_LIMIT" });
    let deep = {};
    let cursor = deep;
    for (let index = 0; index < 10; index += 1) {
      cursor.child = {};
      cursor = cursor.child;
    }
    expect(sanitizeCommercialEgress(deep)).toEqual({ ok: false, issue: "DEPTH_LIMIT" });
    expect(sanitizeCommercialEgress({
      left: "a".repeat(40_000),
      right: "b".repeat(40_000),
    })).toEqual({ ok: false, issue: "TOTAL_LIMIT" });
    expect(normalizeCommercialCodeSnippets([{
      file: "entry.ts",
      content: "x".repeat(4_001),
    }])).toBeNull();
    expect(normalizeCommercialCodeSnippets(Array.from({ length: 11 }, () => ({
      file: "entry.ts",
      content: "safe",
    })))).toBeNull();
    expect(normalizeCommercialCodeSnippets([{
      file: "entry.ts",
      content: "const token = 'very-secret-provider-value'; founder@example.com",
      ignored_free_text: "must not leave",
    }])).toEqual([{
      file: "entry.ts",
      content: "const token = \"[redacted-secret]\"; [redacted-email]",
    }]);
  });

  it("sanitizes model output and rejects an over-limit result before persistence", () => {
    expect(parseCommercialFindingsJson('```json\n{"findings":[],"summary":"ok"}\n```'))
      .toEqual({ findings: [], summary: "ok" });
    expect(parseCommercialFindingsJson('prefix {"findings":[]} suffix')).toBeNull();
    expect(parseCommercialFindingsJson('{"summary":"missing findings"}')).toBeNull();
    expect(parseCommercialFindingsJson("not-json")).toBeNull();
    expect(parseCommercialFindingsJson("x".repeat(32_001))).toBeNull();
    expect(requireSanitizedCommercialOutput({
      report: "Send to analyst@example.com; token=very-secret-provider-value",
    })).toEqual({
      report: "Send to [redacted-email]; token=\"[redacted-secret]\"",
    });
    expect(() => requireSanitizedCommercialOutput({
      report: "x".repeat(32_001),
    })).toThrowError(expect.objectContaining({
      code: "COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED",
      status: 409,
    }));

    const providerSecret = ["sk", "-ant-", "M".repeat(24)].join("");
    const persistence = protectedCommercialPersistenceBindings(
      "founderCopilotAgent",
      {
        brief: `Contact founder@example.com with ${providerSecret}`,
        api_key: "raw-sensitive-key-value",
        auth: "raw-auth-key-value",
        nested: {
          session_token: "raw-nested-token-value",
          deploy_auth_context: "raw-nested-auth-value",
          safe_value: "preserved",
        },
        items: [{ password: "raw-array-password", label: "kept" }],
      },
    );
    expect(persistence.taskPatch.output_payload_json).toBe(persistence.payload);
    expect(persistence.terminal.result).toBe(persistence.payload);
    expect(persistence.terminal.terminalEvent.payload).toBe(persistence.payload);
    expect(persistence.terminal.terminalEvent).toMatchObject({
      eventType: "agent.task.terminal",
      source: "founderCopilotAgent",
    });
    const serializedBindings = JSON.stringify(persistence);
    expect(serializedBindings).not.toContain(providerSecret);
    expect(serializedBindings).not.toContain("founder@example.com");
    expect(serializedBindings).not.toContain("raw-sensitive-key-value");
    expect(serializedBindings).not.toContain("raw-auth-key-value");
    expect(serializedBindings).not.toContain("raw-nested-token-value");
    expect(serializedBindings).not.toContain("raw-nested-auth-value");
    expect(serializedBindings).not.toContain("raw-array-password");
    expect(persistence.payload).toMatchObject({
      nested: { safe_value: "preserved" },
      items: [{ label: "kept" }],
    });
    expect(persistence.payload).not.toHaveProperty("api_key");
    expect(persistence.payload).not.toHaveProperty("auth");
    expect(persistence.payload.nested).not.toHaveProperty("session_token");
    expect(persistence.payload.nested).not.toHaveProperty("deploy_auth_context");
    expect(serializedBindings).toContain("[redacted-secret]");
    expect(serializedBindings).toContain("[redacted-email]");
    expect(() => protectedCommercialPersistenceBindings(
      "unprotectedAgent",
      { report: "safe" },
    )).toThrowError(expect.objectContaining({
      code: "COMMERCIAL_EGRESS_OUTPUT_REVIEW_REQUIRED",
      status: 409,
    }));
  });

  it("shapes QA monitoring as fixed categories and counts without raw task/event text", () => {
    const shaped = shapeQaMonitorProviderSignals([
      {
        agent_name: "billingAgent founder@example.com",
        task_type: "payment_sync",
        error: "timeout token=very-secret-provider-value for founder@example.com",
      },
      { agent_name: "billingAgent", task_type: "payment_sync", error: "deadline exceeded" },
    ], [{
      source: "stripeWebhook",
      event_type: "provider_failed",
      error: "Bearer abcdefghijklmnopqrstuvwxyz founder@example.com",
    }]);
    expect(shaped).toEqual({
      failed_task_count: 2,
      failed_event_count: 1,
      failed_task_buckets: [{
        component_category: "BILLING",
        error_category: "TIMEOUT",
        count: 2,
      }],
      failed_event_buckets: [{
        component_category: "INTEGRATION",
        error_category: "PROVIDER",
        count: 1,
      }],
    });
    const serialized = JSON.stringify(shaped);
    expect(serialized).not.toContain("founder@example.com");
    expect(serialized).not.toContain("very-secret");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("stripeWebhook");
  });

  it("allows only fixed QA flow identifiers and never persists raw thrown messages", async () => {
    expect(normalizeAllowedQaFlows(["analyzer_run", "stripe_connect"]))
      .toEqual(["analyzer_run", "stripe_connect"]);
    expect(normalizeAllowedQaFlows(["custom flow founder@example.com"])).toBeNull();
    const secretError = Object.assign(
      new Error("provider body token=very-secret-provider-value"),
      { code: "UNEXPECTED_PROVIDER_BODY" },
    );
    expect(stableCommercialPublicErrorCode(secretError, "qa_agent_failed"))
      .toBe("qa_agent_failed");
    const response = protectedCommercialErrorResponse(
      secretError,
      "qaAgent",
      "qa_agent_failed",
      false,
    );
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: false, error: "qa_agent_failed" });
    expect(JSON.stringify(payload)).not.toContain("very-secret-provider-value");

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(protectedCommercialBestEffort(secretError, {
      operation: "qaAgent.read_agent_task",
      code: "qa_agent_source_coverage_incomplete",
      fallback: [],
      severity: "secondary",
    })).toEqual([]);
    const logged = warning.mock.calls.flat().join(" ");
    expect(logged).toContain("qa_agent_source_coverage_incomplete");
    expect(logged).not.toContain("very-secret-provider-value");
    expect(logged).not.toContain("UNEXPECTED_PROVIDER_BODY");
    warning.mockRestore();
  });

  it("normalizes policy/input review codes without accepting arbitrary error codes", () => {
    expect(stableCommercialPublicErrorCode(
      { code: COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED },
      "code_review_failed",
    )).toBe("commercial_egress_input_review_required");
    expect(stableCommercialPublicErrorCode(
      { code: "RAW_PROVIDER_RESPONSE_founder@example.com" },
      "security_review_failed",
    )).toBe("security_review_failed");
  });
});
