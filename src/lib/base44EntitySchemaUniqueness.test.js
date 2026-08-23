import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const entitiesRoot = path.resolve("base44/entities");

describe("Base44 entity schema inventory", () => {
  it("declares every remote entity name exactly once", () => {
    const byName = new Map();
    for (const file of fs.readdirSync(entitiesRoot).filter((name) => name.endsWith(".jsonc"))) {
      const source = fs.readFileSync(path.join(entitiesRoot, file), "utf8");
      const name = source.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
      expect(name, `${file} must declare an entity name`).toBeTruthy();
      const files = byName.get(name) || [];
      files.push(file);
      byName.set(name, files);
    }

    const duplicates = [...byName.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => ({ name, files: files.sort() }));
    expect(duplicates).toEqual([]);
  });
});
