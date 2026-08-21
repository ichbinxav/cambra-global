import { normalizeCurrencyCode } from "./marketMoney.ts";

const ISO_4217_CODES = new Set(`
  AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND
  BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU
  CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP
  GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES
  KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD
  MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR
  PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD
  SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS
  UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB
  XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XUA YER ZAR ZMW ZWG
`.trim().split(/\s+/));

const MONETARY_FIELDS = [
  "monthly_revenue",
  "avg_order_value",
  "monthly_shipping_cost",
  "total_saas_spend",
  "banking_monthly_fees",
  "monthly_terminal_rental",
  "in_store_gmv",
  "in_store_avg_ticket",
  "fixed_banking_fees",
  "maintenance_fees",
];

export const PUBLIC_ANALYZER_INPUT_FIELDS = Object.freeze([
  "brand_id",
  "monthly_revenue",
  "currency",
  "monthly_transactions",
  "avg_order_value",
  "payment_fee_pct",
  "monthly_shipping_cost",
  "monthly_shipments",
  "total_saas_spend",
]);

const PUBLIC_ANALYZER_INPUT_FIELD_SET = new Set(PUBLIC_ANALYZER_INPUT_FIELDS);
const PUBLIC_ANALYZER_INPUT_NUMERIC_FIELDS = Object.freeze([
  "monthly_revenue",
  "monthly_transactions",
  "avg_order_value",
  "payment_fee_pct",
  "monthly_shipping_cost",
  "monthly_shipments",
  "total_saas_spend",
]);
const SAFE_ENTITY_ID = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,159}$/;

function supplied(value: any) {
  return value !== undefined && value !== null && value !== "";
}

export class AnalyzerInputCurrencyError extends Error {
  code: string;
  status = 400;

  constructor(code: string) {
    super(code.toLowerCase());
    this.name = "AnalyzerInputCurrencyError";
    this.code = code;
  }
}

export class AnalyzerInputAuthorityError extends Error {
  code: string;
  status: number;
  public_safe = true;

  constructor(code: string, status: number) {
    super(code.toLowerCase());
    this.name = "AnalyzerInputAuthorityError";
    this.code = code;
    this.status = status;
  }
}

export function isAnalyzerInputCurrencyError(
  error: any,
): error is AnalyzerInputCurrencyError {
  return error?.name === "AnalyzerInputCurrencyError" &&
    Number(error?.status) === 400 &&
    typeof error?.code === "string";
}

export function isAnalyzerInputAuthorityError(
  error: any,
): error is AnalyzerInputAuthorityError {
  return error?.name === "AnalyzerInputAuthorityError" &&
    Number.isInteger(Number(error?.status)) &&
    typeof error?.code === "string" && error?.public_safe === true;
}

export function isAnalyzerInputBoundaryError(error: any) {
  return isAnalyzerInputCurrencyError(error) ||
    isAnalyzerInputAuthorityError(error);
}

/**
 * Validate the money unit at every public AnalyzerInput writer. Currency is
 * normalized once at ingress and becomes mandatory whenever any AnalyzerInput
 * monetary amount is supplied. No writer may persist a unitless amount.
 */
export function validateAnalyzerInputCurrency(input: any) {
  const hasMonetaryField = input && (
    MONETARY_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(input, field) &&
      supplied(input[field])
    ) ||
    (Array.isArray(input.saas_tools) && input.saas_tools.some((tool: any) =>
      tool && supplied(tool.monthly_cost)
    )) ||
    (Array.isArray(input.manually_added_tools) &&
      input.manually_added_tools.some((tool: any) =>
        tool && supplied(tool.monthly_cost)
      ))
  );
  const hasCurrency = input &&
    Object.prototype.hasOwnProperty.call(input, "currency") &&
    supplied(input.currency);
  if (hasMonetaryField && !hasCurrency) {
    throw new AnalyzerInputCurrencyError(
      "ANALYZER_INPUT_CURRENCY_REQUIRED_WITH_MONETARY_FIELDS",
    );
  }
  if (!hasCurrency) return null;
  if (typeof input.currency !== "string") {
    throw new AnalyzerInputCurrencyError("ANALYZER_INPUT_CURRENCY_INVALID");
  }
  const currency = normalizeCurrencyCode(input.currency);
  if (!currency || !ISO_4217_CODES.has(currency)) {
    throw new AnalyzerInputCurrencyError("ANALYZER_INPUT_CURRENCY_INVALID");
  }
  return currency;
}

/**
 * Runtime parser for the public API/MCP AnalyzerInput create boundary. MCP
 * inputSchema is descriptive metadata, not an enforcement mechanism, so this
 * function rejects unknown keys and returns a newly constructed allowlist-only
 * payload. Internal service-role projections use their own wider schema.
 */
export function buildPublicAnalyzerInputPayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AnalyzerInputCurrencyError("ANALYZER_INPUT_OBJECT_REQUIRED");
  }
  const source = input as Record<string, unknown>;
  const unknownFields = Object.keys(source).filter((field) =>
    !PUBLIC_ANALYZER_INPUT_FIELD_SET.has(field)
  );
  if (unknownFields.length > 0) {
    throw new AnalyzerInputCurrencyError("ANALYZER_INPUT_UNKNOWN_FIELD");
  }
  if (typeof source.brand_id !== "string" ||
    !SAFE_ENTITY_ID.test(source.brand_id)) {
    throw new AnalyzerInputCurrencyError("ANALYZER_INPUT_BRAND_ID_INVALID");
  }
  for (const field of PUBLIC_ANALYZER_INPUT_NUMERIC_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      (field === "payment_fee_pct" && value > 100)) {
      throw new AnalyzerInputCurrencyError(
        `ANALYZER_INPUT_${field.toUpperCase()}_INVALID`,
      );
    }
  }
  const currency = validateAnalyzerInputCurrency(source);
  const payload: { brand_id: string; [key: string]: unknown } = {
    brand_id: source.brand_id,
  };
  for (const field of PUBLIC_ANALYZER_INPUT_NUMERIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      payload[field] = source[field];
    }
  }
  if (currency) payload.currency = currency;
  return payload;
}

export async function createAuthorizedPublicAnalyzerInput(
  input: unknown,
  dependencies: {
    authorizeBrand: (brandId: string) => Promise<void>;
    create: (
      payload: ReturnType<typeof buildPublicAnalyzerInputPayload>,
    ) => Promise<any>;
  },
) {
  const payload = buildPublicAnalyzerInputPayload(input);
  await dependencies.authorizeBrand(payload.brand_id);
  const created = await dependencies.create(payload);
  return { created, payload };
}

/**
 * Public API and MCP writes run as service role, so Brand existence and tenant
 * authority must be proved by one exact, cardinality-bounded read before the
 * create. A missing, duplicate, malformed, or unavailable authority is never
 * converted to a nullable best-effort result.
 */
export async function createTenantAuthorizedPublicAnalyzerInput(
  input: unknown,
  dependencies: {
    readBrandsExact: (brandId: string) => Promise<unknown>;
    authorizeBrandRecord: (brand: any) => void | Promise<void>;
    create: (
      payload: ReturnType<typeof buildPublicAnalyzerInputPayload>,
    ) => Promise<any>;
  },
) {
  return createAuthorizedPublicAnalyzerInput(input, {
    authorizeBrand: async (brandId) => {
      let rows: unknown;
      try {
        rows = await dependencies.readBrandsExact(brandId);
      } catch {
        throw new AnalyzerInputAuthorityError(
          "ANALYZER_INPUT_BRAND_AUTHORITY_UNAVAILABLE",
          503,
        );
      }
      if (!Array.isArray(rows)) {
        throw new AnalyzerInputAuthorityError(
          "ANALYZER_INPUT_BRAND_AUTHORITY_UNAVAILABLE",
          503,
        );
      }
      if (rows.length === 0) {
        throw new AnalyzerInputAuthorityError(
          "ANALYZER_INPUT_BRAND_NOT_FOUND",
          404,
        );
      }
      if (rows.length !== 1) {
        throw new AnalyzerInputAuthorityError(
          "ANALYZER_INPUT_BRAND_AUTHORITY_AMBIGUOUS",
          503,
        );
      }
      const brand = rows[0];
      if (!brand || typeof brand !== "object" ||
        String((brand as any).id || "") !== brandId) {
        throw new AnalyzerInputAuthorityError(
          "ANALYZER_INPUT_BRAND_AUTHORITY_AMBIGUOUS",
          503,
        );
      }
      await dependencies.authorizeBrandRecord(brand);
    },
    create: dependencies.create,
  });
}

/**
 * Executable service-role adapter used by both public transports. Keeping the
 * datastore calls here makes the handler contract behavior-testable: the Brand
 * authority read is always exact and cardinality-bounded, and AnalyzerInput is
 * unreachable until that authority has been established.
 */
export async function createTenantAuthorizedPublicAnalyzerInputFromServiceRole(
  input: unknown,
  dependencies: {
    serviceRole: any;
    authorizeBrandRecord: (brand: any) => void | Promise<void>;
  },
) {
  const serviceRole = dependencies?.serviceRole;
  if (
    !serviceRole?.entities?.Brand?.filter ||
    !serviceRole?.entities?.AnalyzerInput?.create
  ) {
    throw new AnalyzerInputAuthorityError(
      "ANALYZER_INPUT_BRAND_AUTHORITY_UNAVAILABLE",
      503,
    );
  }
  return createTenantAuthorizedPublicAnalyzerInput(input, {
    readBrandsExact: (brandId) =>
      serviceRole.entities.Brand.filter(
        { id: brandId },
        "-created_date",
        2,
      ),
    authorizeBrandRecord: dependencies.authorizeBrandRecord,
    create: (payload) => serviceRole.entities.AnalyzerInput.create(payload),
  });
}
