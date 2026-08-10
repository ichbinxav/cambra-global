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
// v62.2.1: `export * from` alone dropped the SDK's DEFAULT export and the
// server-side factory the handlers import, which surfaced as "createClientFromRequest
// is not exported". Both are re-declared explicitly here; everything else
// still comes from the installed package's own types.
declare module "npm:@base44/sdk@0.8.25" {
  export * from "@base44/sdk";
  export { default } from "@base44/sdk";
  export function createClientFromRequest(req: Request): any;
}
declare module "npm:@base44/sdk@0.8.41" {
  export * from "@base44/sdk";
  export { default } from "@base44/sdk";
  export function createClientFromRequest(req: Request): any;
}

// Shared PDF builder dependency → real installed jspdf types.
// jspdf ships jsPDF as a DEFAULT export, so re-exporting only named symbols
// left `import jsPDF from "npm:jspdf@4.0.0"` untyped.
declare module "npm:jspdf@4.0.0" {
  export * from "jspdf";
  export { default } from "jspdf";
}

// P6 Stripe webhook/payment-link pinned Deno specifiers → the real installed
// stripe@17.7.0 type surface. No blanket npm:* declaration is introduced.
declare module "npm:stripe@17.7.0" {
  export * from "stripe";
  export { default } from "stripe";
}
declare module "npm:stripe@14.25.0" {
  export * from "stripe14";
  export { default } from "stripe14";
}