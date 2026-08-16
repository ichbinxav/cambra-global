import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const TARGETS = ["PaymentEvent", "Invoice", "MonthlySavingsReport"];
const SERVICE_ROLE_WRITE = {
  user_condition: { role: "__service_role_only__" },
};
const ADMIN_READ = {
  user_condition: { role: "admin" },
};
const ADMIN_OR_CREATOR_READ = {
  $or: [
    { user_condition: { role: "admin" } },
    { created_by: "{{user.email}}" },
  ],
};

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function schema(entity) {
  return JSON.parse(read(`base44/entities/${entity}.jsonc`));
}

function sourceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "docs" || entry.name === "generated") continue;
      result.push(...sourceFiles(absolute));
      continue;
    }
    if (!/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) continue;
    result.push(absolute);
  }
  return result;
}

const target = `(?:${TARGETS.join("|")})`;
const mutator =
  "(?:create|bulkCreate|update|updateMany|delete|deleteMany|importEntities)";
const directClientMutation = new RegExp(
  `entities\\s*(?:\\??\\.\\s*${target}|\\[\\s*["']${target}["']\\s*\\])\\s*\\??\\.\\s*${mutator}\\s*\\(`,
  "g",
);

describe("financial authority entities are service-role write-only", () => {
  it.each(TARGETS)(
    "%s rejects every direct user/admin write while preserving service-role access",
    (entity) => {
      expect(schema(entity).rls.write).toEqual(SERVICE_ROLE_WRITE);
    },
  );

  it("does not change the existing read policies", () => {
    expect(schema("PaymentEvent").rls.read).toEqual(ADMIN_READ);
    expect(schema("Invoice").rls.read).toEqual(ADMIN_OR_CREATOR_READ);
    expect(schema("MonthlySavingsReport").rls.read).toEqual(
      ADMIN_OR_CREATOR_READ,
    );
  });

  it("has no direct financial-ledger mutator in production frontend code", () => {
    const hits = [];
    for (const absolute of sourceFiles(path.join(ROOT, "src"))) {
      const source = fs.readFileSync(absolute, "utf8");
      directClientMutation.lastIndex = 0;
      for (const match of source.matchAll(directClientMutation)) {
        const line = source.slice(0, match.index).split("\n").length;
        hits.push(`${path.relative(ROOT, absolute)}:${line}:${match[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("routes existing admin and merchant actions through governed backend functions", () => {
    const adminInvoices = read("src/pages/admin/AdminInvoices.jsx");
    for (
      const functionName of [
        "createPaymentLink",
        "recordPayment",
        "reconcileInvoice",
        "generateInvoicePdf",
      ]
    ) {
      expect(adminInvoices).toContain(`functions.invoke('${functionName}'`);
    }

    const recoverBilling = read(
      "src/components/admin/recoverBilling/RecoverBillingTable.jsx",
    );
    expect(recoverBilling).toContain(
      'functions.invoke("approveRecoverReportForInvoicing"',
    );
    expect(recoverBilling).toContain(
      'functions.invoke("createEligibleRecoverInvoices"',
    );

    const merchantInvoices = read("src/pages/Invoices.jsx");
    expect(merchantInvoices).toContain(
      "functions.invoke('getMyBillingRecords'",
    );
  });

  it("terminally quarantines the legacy invoice entity-event route before any authority or write", () => {
    const source = read("base44/functions/onInvoiceStatusEvent/entry.ts");
    expect(source).toMatch(/Deno\.serve\(\(\)\s*=>\s*Response\.json/);
    expect(source).toContain('error: "route_quarantined"');
    expect(source).toContain("{ status: 410 }");
    expect(source).toContain("effects_committed: false");
    expect(source).not.toMatch(
      /createClientFromRequest|req\.json|requireAdminOrInternal/,
    );
    expect(source).not.toMatch(
      /entities\.(?:PaymentEvent|Invoice|MonthlySavingsReport)/,
    );
  });

  it("blocks local PDF generation for provider-authoritative Recover/Stripe invoices before effects", () => {
    const source = read("base44/functions/generateInvoicePdf/entry.ts");
    const invoiceRead = source.indexOf("entities.Invoice.filter");
    const guard = source.indexOf("canonical_provider_invoice_artifact_only");
    const pdfGeneration = source.indexOf("new jsPDF()", guard);
    const upload = source.indexOf("UploadPrivateFile", guard);
    const invoiceWrite = source.indexOf("entities.Invoice.update", guard);

    expect(invoiceRead).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(invoiceRead);
    expect(source.slice(invoiceRead, guard)).not.toMatch(
      /UploadPrivateFile|entities\.Invoice\.update/,
    );
    expect(source.slice(invoiceRead, guard)).toContain(
      "inv.monthly_savings_report_id",
    );
    expect(source.slice(invoiceRead, guard)).toMatch(
      /String\(inv\.payment_provider\s*\|\|\s*["']["']\)\.toLowerCase\(\)\s*===\s*["']stripe["']/,
    );
    expect(source.slice(invoiceRead, guard)).toContain("inv.stripe_invoice_id");
    expect(source.slice(guard - 260, guard + 220)).toContain("effects: false");
    expect(source.slice(guard - 260, guard + 260)).toContain("status: 409");
    expect(pdfGeneration).toBeGreaterThan(guard);
    expect(upload).toBeGreaterThan(guard);
    expect(invoiceWrite).toBeGreaterThan(guard);
  });
});
