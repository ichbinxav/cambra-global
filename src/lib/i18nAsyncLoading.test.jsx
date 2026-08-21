// @vitest-environment jsdom
import React, { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "./locales/en.js";
import es from "./locales/es.js";
import fr from "./locales/fr.js";
import pl from "./locales/pl.js";
import {
  LanguageProvider,
  preloadInitialLanguage,
  useTranslation,
} from "./i18n.jsx";

const INITIAL_ENGLISH = Object.freeze({
  lang: "en",
  dictionaryLanguage: "en",
  dictionary: en,
  detectedLang: "en",
  isAutomatic: false,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function LanguageProbe() {
  const { lang, t, setLang } = useTranslation();
  const [result, setResult] = useState("idle");
  const choose = (code) => {
    void setLang(code).then((ok) => setResult(`${code}:${ok}`));
  };
  return (
    <div>
      <output data-testid="lang">{lang}</output>
      <output data-testid="copy">{t("language_switcher_label")}</output>
      <output data-testid="result">{result}</output>
      <button type="button" onClick={() => choose("fr")}>French</button>
      <button type="button" onClick={() => choose("es")}>Spanish</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["en-GB"] });
  Object.defineProperty(navigator, "language", { configurable: true, value: "en-GB" });
});

afterEach(() => cleanup());

describe("asynchronous language dictionaries", () => {
  it("awaits the initial dictionary before mounting React or removing a prerender", () => {
    const main = fs.readFileSync(path.resolve("src/main.jsx"), "utf8");
    const preload = main.indexOf("await preloadInitialLanguage()");
    const render = main.indexOf("ReactDOM.createRoot(rootEl).render");
    const prerenderCleanup = main.indexOf("const toRemove", render);
    expect(preload).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(preload);
    expect(prerenderCleanup).toBeGreaterThan(render);
  });

  it("preloads the stored language before the application bootstrap", async () => {
    localStorage.setItem("cambra_lang", "pl");
    const dictionaryLoader = vi.fn(async (code) => {
      expect(code).toBe("pl");
      return pl;
    });

    const initial = await preloadInitialLanguage({ dictionaryLoader });

    expect(initial.lang).toBe("pl");
    expect(initial.dictionaryLanguage).toBe("pl");
    expect(initial.dictionary).toBe(pl);
    expect(initial.isAutomatic).toBe(false);
    expect(dictionaryLoader).toHaveBeenCalledTimes(1);
  });

  it("lets the newest language request win when an older chunk resolves later", async () => {
    const pending = { fr: deferred(), es: deferred() };
    const dictionaryLoader = vi.fn((code) => pending[code].promise);
    render(
      <LanguageProvider
        initialLanguageState={INITIAL_ENGLISH}
        dictionaryLoader={dictionaryLoader}
      >
        <LanguageProbe />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Spanish" }));
    expect(dictionaryLoader.mock.calls.map(([code]) => code)).toEqual(["fr", "es"]);

    await act(async () => pending.es.resolve(es));
    await waitFor(() => expect(screen.getByTestId("lang").textContent).toBe("es"));
    expect(screen.getByTestId("copy").textContent).toBe(es.language_switcher_label);
    expect(localStorage.getItem("cambra_lang")).toBe("es");

    await act(async () => pending.fr.resolve(fr));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("fr:false"));
    expect(screen.getByTestId("lang").textContent).toBe("es");
    expect(screen.getByTestId("copy").textContent).toBe(es.language_switcher_label);
    expect(localStorage.getItem("cambra_lang")).toBe("es");
  });

  it("keeps the current complete language when a requested chunk fails", async () => {
    const dictionaryLoader = vi.fn(async () => {
      throw new Error("simulated_chunk_failure");
    });
    render(
      <LanguageProvider
        initialLanguageState={INITIAL_ENGLISH}
        dictionaryLoader={dictionaryLoader}
      >
        <LanguageProbe />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "French" }));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("fr:false"));

    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("copy").textContent).toBe(en.language_switcher_label);
    expect(localStorage.getItem("cambra_lang")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });

  it("falls back to eager English when the initial language preload fails", async () => {
    localStorage.setItem("cambra_lang", "fr");
    const initial = await preloadInitialLanguage({
      dictionaryLoader: vi.fn(async () => {
        throw new Error("simulated_initial_chunk_failure");
      }),
    });

    expect(initial.lang).toBe("en");
    expect(initial.dictionaryLanguage).toBe("en");
    expect(initial.dictionary).toBe(en);
    expect(initial.isAutomatic).toBe(false);
  });
});
