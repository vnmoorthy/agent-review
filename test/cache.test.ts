import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCacheKey,
  loadCache,
  saveCache,
  store,
  lookup,
  cachePath,
} from "../src/core/cache.js";

describe("cache", () => {
  it("returns an empty cache when the file doesn't exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-cache-"));
    const cache = loadCache(cachePath(dir));
    expect(cache.entries).toEqual([]);
  });

  it("save + load roundtrips entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-cache-"));
    const path = cachePath(dir);
    const cache = { schema: "agent-review-cache/v1", entries: [] as any[] };
    const f: any = { detectorId: "AR012", file: "src/x.ts", line: 1 };
    const k = buildCacheKey("src/x.ts", "console.log()", "0.1.0", false);
    store(cache, k, [f]);
    saveCache(path, cache);
    const loaded = loadCache(path);
    expect(loaded.entries.length).toBe(1);
    expect(lookup(loaded, k)?.[0]?.detectorId).toBe("AR012");
  });

  it("upserts on conflicting key", () => {
    const cache = { schema: "agent-review-cache/v1", entries: [] as any[] };
    store(cache, "k1", [{ detectorId: "AR001", file: "x", line: 1 } as any]);
    store(cache, "k1", [{ detectorId: "AR002", file: "x", line: 2 } as any]);
    expect(cache.entries.length).toBe(1);
    expect(cache.entries[0]?.findings[0]?.detectorId).toBe("AR002");
  });

  it("buildCacheKey is deterministic and content-sensitive", () => {
    const k1 = buildCacheKey("src/x.ts", "abc", "0.1.0", false);
    const k2 = buildCacheKey("src/x.ts", "abc", "0.1.0", false);
    const k3 = buildCacheKey("src/x.ts", "abd", "0.1.0", false);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
