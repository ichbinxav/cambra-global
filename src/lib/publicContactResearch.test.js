import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import {
  collectOpenAiWebSources,
  extractOpenAiOutputText,
  normalizePublicResearchCandidates,
  publicContactResearchRequest,
  safePublicHttpsUrl,
  sourceBelongsToCompany,
  verifyExplicitPublicEmail,
} from "../../base44/shared/publicContactResearch.ts";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function responsePayload(candidates, sources = []) {
  return {
    output: [
      {
        type: "web_search_call",
        action: { sources },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ candidates }),
            annotations: sources.map((source) => ({
              type: "url_citation",
              url: source.url,
              title: source.title,
            })),
          },
        ],
      },
    ],
  };
}

function candidate(overrides = {}) {
  return {
    name: "Ana Finance",
    title: "Chief Financial Officer",
    normalized_role: "CFO",
    employer_domain: "shop.example",
    current_employment_evidence: true,
    email: "ana@shop.example",
    email_source_url: "https://shop.example/contact",
    role_source_url: "https://shop.example/team/ana",
    linkedin_url: null,
    ...overrides,
  };
}

function publicResponse(
  body,
  url = "https://shop.example/contact",
  headers = {},
) {
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("automatic public contact research", () => {
  it("accepts only public HTTPS URLs and blocks local or credentialed targets", () => {
    expect(safePublicHttpsUrl("https://shop.example/team")).toBe(
      "https://shop.example/team",
    );
    expect(safePublicHttpsUrl("http://shop.example/team")).toBe("");
    expect(safePublicHttpsUrl("https://user:pass@shop.example/team")).toBe("");
    expect(safePublicHttpsUrl("https://localhost/team")).toBe("");
    expect(safePublicHttpsUrl("https://127.0.0.1/team")).toBe("");
    expect(safePublicHttpsUrl("https://192.168.1.4/team")).toBe("");
    expect(safePublicHttpsUrl("https://[::1]/team")).toBe("");
    expect(
      sourceBelongsToCompany(
        "https://careers.shop.example/ana",
        "shop.example",
      ),
    )
      .toBe(true);
    expect(
      sourceBelongsToCompany(
        "https://shop.example.evil.test/ana",
        "shop.example",
      ),
    )
      .toBe(false);
  });

  it("extracts deduplicated search sources and structured output", () => {
    const payload = responsePayload([candidate()], [
      { url: "https://shop.example/team/ana", title: "Team" },
      { url: "https://www.shop.example/team/ana", title: "Duplicate" },
      { url: "http://unsafe.example/", title: "Unsafe" },
    ]);
    expect(collectOpenAiWebSources(payload)).toEqual([
      { url: "https://shop.example/team/ana", title: "Team" },
    ]);
    expect(JSON.parse(extractOpenAiOutputText(payload))).toEqual({
      candidates: [candidate()],
    });
  });

  it("keeps only current exact-employer roles and never accepts unsafe emails", () => {
    const sources = [
      { url: "https://shop.example/team/ana", title: "Team" },
      { url: "https://shop.example/contact", title: "Contact" },
    ];
    const payload = responsePayload([
      candidate(),
      candidate({
        name: "Procurement Lead",
        normalized_role: "HEAD_OF_PROCUREMENT",
        title: "Head of Procurement",
        email: "hello@shop.example",
      }),
      candidate({
        name: "Wrong Employer",
        employer_domain: "other.example",
      }),
      candidate({
        name: "Unsupported Role",
        normalized_role: "OTHER",
      }),
      candidate({
        name: "Uncited Person",
        role_source_url: "https://shop.example/team/uncited",
      }),
      candidate({
        name: "Personal Address",
        email: "person@gmail.com",
      }),
    ], sources);
    const normalized = normalizePublicResearchCandidates(payload, {
      company_domain: "shop.example",
    });

    expect(normalized.candidates.map((row) => row.name)).toEqual([
      "Ana Finance",
      "Personal Address",
      "Procurement Lead",
    ]);
    expect(normalized.candidates[0]).toMatchObject({
      email: "ana@shop.example",
      role_source_returned: true,
      email_source_returned: true,
    });
    expect(normalized.candidates[1].email).toBeNull();
    expect(normalized.candidates[2].email).toBeNull();
  });

  it("verifies an exact professional email only on the cited company page", async () => {
    const fetchImpl = vi.fn(async () =>
      publicResponse("<p>Contact Ana at ana&#64;shop.example</p>")
    );
    await expect(verifyExplicitPublicEmail(
      {
        email: "ana@shop.example",
        email_source_url: "https://shop.example/contact",
        email_source_returned: true,
      },
      "shop.example",
      fetchImpl,
    )).resolves.toMatchObject({
      verified: true,
      source_url: "https://shop.example/contact",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://shop.example/contact",
      expect.objectContaining({ redirect: "manual" }),
    );

    await expect(verifyExplicitPublicEmail(
      {
        email: "ana@shop.example",
        email_source_url: "https://shop.example/contact",
        email_source_returned: true,
      },
      "shop.example",
      async () => publicResponse("No email here"),
    )).resolves
      .toMatchObject({
        verified: false,
        reason: "email_not_observed_verbatim",
      });

    await expect(verifyExplicitPublicEmail(
      {
        email: "ana@shop.example",
        email_source_url: "https://shop.example/contact",
        email_source_returned: true,
      },
      "shop.example",
      async () =>
        publicResponse(
          "ana@shop.example",
          "https://private.example/redirected",
        ),
    )).resolves.toMatchObject({
      verified: false,
      reason: "official_source_unreadable",
    });

    await expect(verifyExplicitPublicEmail(
      {
        email: "ana@shop.example",
        email_source_url: "https://shop.example/contact",
        email_source_returned: true,
      },
      "shop.example",
      async () =>
        publicResponse("", "https://shop.example/contact", {
          "content-length": "600001",
        }),
    )).resolves.toMatchObject({
      verified: false,
      reason: "email_not_observed_verbatim",
    });
  });

  it("sends only the approved company identity fields to OpenAI", () => {
    const request = publicContactResearchRequest(
      {
        company_name: "Shop Example",
        company_domain: "https://www.shop.example/path",
        country: "es",
        contact_email: "private-contact@shop.example",
        internal_notes: "DO_NOT_TRANSFER_INTERNAL_NOTES_91827",
        enrichment_json: { secret: "DO_NOT_TRANSFER_SECRET_77129" },
      },
      99,
      "gpt-5.4-mini",
    );
    const serialized = JSON.stringify(request);

    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
      store: false,
      max_tool_calls: 3,
      tools: [{ type: "web_search", search_context_size: "low" }],
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(request.input).toContain(
      '{"name":"Shop Example","domain":"shop.example","country":"ES"}',
    );
    expect(serialized).not.toContain("private-contact@shop.example");
    expect(serialized).not.toContain("DO_NOT_TRANSFER_INTERNAL_NOTES_91827");
    expect(serialized).not.toContain("DO_NOT_TRANSFER_SECRET_77129");
  });

  it("runs public research before Apollo and never persists an unverified shortlist", () => {
    const source = read("base44/functions/leadEnrichmentAgent/entry.ts");
    const loop = source.slice(
      source.indexOf("for (const queuedLead of leads)"),
    );
    const publicCall = loop.indexOf("callAutomaticPublicContactResearch");
    const apolloCall = loop.indexOf("searchApolloContacts");
    expect(publicCall).toBeGreaterThan(-1);
    expect(apolloCall).toBeGreaterThan(publicCall);
    expect(loop).toContain("publicShortlist = publicResult.shortlist");
    expect(loop).toContain("publicShortlist,");
    expect(loop).not.toMatch(/contact_full_name:\s*publicShortlist/);
    expect(loop).not.toMatch(/contact_email:\s*publicShortlist/);
    expect(loop).toContain("selected = publicResult.verified_contact");
    expect(loop).toContain("exact_email_observed: true");
    expect(loop).toContain("public_research_completed_first: true");
    expect(loop).toContain("PUBLIC_CONTACT_RESEARCH_CONTRACT_VERSION");
  });
});
