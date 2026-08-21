#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const FRONTEND_ENTRY_BUDGET_BYTES = 500_000;

function externalModuleSources(html) {
  const tags = html.match(/<script\b[^>]*>/gi) || [];
  return tags.flatMap((tag) => {
    if (!/\btype=["']module["']/i.test(tag)) return [];
    const source = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    return source ? [source] : [];
  });
}

function modulePreloadSources(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  return tags.flatMap((tag) => {
    if (!/\brel=["']modulepreload["']/i.test(tag)) return [];
    const source = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    return source ? [source] : [];
  });
}

function deferredLocaleCodes(localeDir) {
  if (!fs.existsSync(localeDir)) throw new Error(`frontend_locale_dir_missing:${localeDir}`);
  return fs.readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[a-z]{2}\.js$/.test(entry.name) && entry.name !== "en.js")
    .map((entry) => entry.name.slice(0, 2));
}

export function inspectFrontendEntryBudget({
  distDir = "dist",
  localeDir = "src/lib/locales",
  limitBytes = FRONTEND_ENTRY_BUDGET_BYTES,
} = {}) {
  const absoluteDist = path.resolve(distDir);
  const indexPath = path.join(absoluteDist, "index.html");
  if (!fs.existsSync(indexPath)) throw new Error(`frontend_entry_index_missing:${indexPath}`);

  const html = fs.readFileSync(indexPath, "utf8");
  const sources = externalModuleSources(html);
  if (sources.length !== 1) throw new Error(`frontend_entry_count_invalid:${sources.length}`);

  const localeCodes = new Set(deferredLocaleCodes(path.resolve(localeDir)));
  const preloadedLocales = modulePreloadSources(html).filter((source) => {
    const fileName = source.split(/[?#]/, 1)[0].split("/").pop() || "";
    return localeCodes.has(fileName.match(/^([a-z]{2})-/)?.[1]);
  });
  if (preloadedLocales.length) {
    throw new Error(`frontend_deferred_locale_preloaded:${preloadedLocales.join(",")}`);
  }

  const source = sources[0];
  if (/^(?:[a-z]+:)?\/\//i.test(source)) throw new Error(`frontend_entry_not_local:${source}`);
  const pathname = source.split(/[?#]/, 1)[0];
  const entryPath = path.resolve(absoluteDist, pathname.replace(/^\/+/, ""));
  if (entryPath !== absoluteDist && !entryPath.startsWith(`${absoluteDist}${path.sep}`)) {
    throw new Error(`frontend_entry_outside_dist:${source}`);
  }
  if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
    throw new Error(`frontend_entry_missing:${source}`);
  }

  const bytes = fs.statSync(entryPath).size;
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
    throw new Error(`frontend_entry_budget_invalid:${limitBytes}`);
  }
  if (bytes >= limitBytes) throw new Error(`frontend_entry_budget_exceeded:${bytes}:${limitBytes}:${source}`);

  return Object.freeze({
    source,
    entryPath,
    bytes,
    limitBytes,
    remainingBytes: limitBytes - bytes,
    deferredLocalePreloads: preloadedLocales.length,
  });
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    const result = inspectFrontendEntryBudget({ distDir: process.argv[2] || "dist" });
    console.log(
      `frontend:entry-budget PASS — ${result.source} ${result.bytes}/${result.limitBytes} bytes`,
    );
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}
