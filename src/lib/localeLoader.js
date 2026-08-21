import en from "./locales/en.js";

// English is the only dictionary in the initial application graph. Vite turns
// every other importer into an independent, content-hashed chunk and fetches
// only the language the visitor actually uses.
const localeImporters = import.meta.glob(
  ["./locales/*.js", "!./locales/en.js"],
  { import: "default" },
);
const languageFromPath = (modulePath) => modulePath.match(/\/([a-z]{2})\.js$/)?.[1] || null;
const supportedLanguages = new Set(
  ["en", ...Object.keys(localeImporters).map(languageFromPath).filter(Boolean)],
);

/** @type {Map<string, Record<string, string>>} */
const dictionaryCache = new Map([["en", en]]);
const inFlightLoads = new Map();

export const EN_DICTIONARY = en;

export function isSupportedLanguage(value) {
  return typeof value === "string" && supportedLanguages.has(value.toLowerCase());
}

export function getCachedLanguageDictionary(value) {
  const code = String(value || "").toLowerCase();
  return dictionaryCache.get(code) || null;
}

export async function loadLanguageDictionary(value) {
  const code = String(value || "").toLowerCase();
  if (!isSupportedLanguage(code)) throw new Error(`unsupported_language:${code || "empty"}`);

  const cached = dictionaryCache.get(code);
  if (cached) return cached;

  const pending = inFlightLoads.get(code);
  if (pending) return pending;

  const importer = localeImporters[`./locales/${code}.js`];
  if (!importer) throw new Error(`language_chunk_missing:${code}`);

  const load = Promise.resolve()
    .then(() => importer())
    .then((dictionary) => {
      if (
        !dictionary
        || typeof dictionary !== "object"
        || Array.isArray(dictionary)
        || Object.values(dictionary).some((value) => typeof value !== "string")
      ) {
        throw new Error(`language_dictionary_invalid:${code}`);
      }
      const normalizedDictionary = /** @type {Record<string, string>} */ (dictionary);
      dictionaryCache.set(code, normalizedDictionary);
      return normalizedDictionary;
    })
    .finally(() => {
      inFlightLoads.delete(code);
    });

  inFlightLoads.set(code, load);
  return load;
}
