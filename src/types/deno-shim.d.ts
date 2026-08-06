// v62.2 CP3 — ambient declarations for the critical-path tsconfig.
// NO blanket `declare module "npm:*"` (that would silently turn every npm:
// import into `any`). Each pinned Deno specifier used by the critical set is
// mapped onto the REAL installed package's own type declarations, so the
// SDK/jspdf surface is typed by its actual contract.

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// Pinned SDK specifiers found in the critical handler set → real SDK types.
declare module "npm:@base44/sdk@0.8.31" { export * from "@base44/sdk"; }
declare module "npm:@base44/sdk@0.8.38" { export * from "@base44/sdk"; }
declare module "npm:@base44/sdk@0.8.40" { export * from "@base44/sdk"; }

// Shared PDF builder dependency → real installed jspdf types.
declare module "npm:jspdf@4.0.0" { export * from "jspdf"; }