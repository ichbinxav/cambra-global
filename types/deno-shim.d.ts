// v62.1 — ambient shims so the critical-path tsconfig can type-check shared
// modules that reference the Deno runtime or npm: specifiers without pulling
// in the full Deno type surface.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

declare module "npm:*";