// Persistent finding cache keyed by content hash.
//
// Real-world workflows run agent-review repeatedly: on every commit hook,
// every PR push, every Claude Code save. Re-analyzing identical content is
// wasted work. The cache stores per-file findings keyed on the SHA-1 of the
// file's new content + the agent-review version + the LLM-enabled flag.
//
// Cache location: <repo>/.agent-review-cache/findings.json
// Bounded by entry count (default 5,000) to keep the file small.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import type { Finding } from "./detectors/types.js";
import { logger } from "./logger.js";

const SCHEMA = "agent-review-cache/v1";
const MAX_ENTRIES = 5000;
const CACHE_DIR = ".agent-review-cache";
const CACHE_FILE = "findings.json";

interface CacheEntry {
  key: string; // contentHash + version + llmFlag
  findings: Finding[];
  storedAt: string;
}

interface CacheFile {
  schema: string;
  entries: CacheEntry[];
}

export function cachePath(repoRoot: string): string {
  return join(repoRoot, CACHE_DIR, CACHE_FILE);
}

export function buildCacheKey(
  filePath: string,
  newContent: string | undefined,
  toolVersion: string,
  llmEnabled: boolean
): string {
  const h = createHash("sha1");
  h.update(filePath);
  h.update("|");
  h.update(newContent ?? "");
  h.update("|");
  h.update(toolVersion);
  h.update("|");
  h.update(llmEnabled ? "llm" : "static");
  return h.digest("hex");
}

export function loadCache(path: string): CacheFile {
  if (!existsSync(path)) return { schema: SCHEMA, entries: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data?.schema !== SCHEMA || !Array.isArray(data.entries)) {
      return { schema: SCHEMA, entries: [] };
    }
    return data;
  } catch {
    return { schema: SCHEMA, entries: [] };
  }
}

export function saveCache(path: string, cache: CacheFile): void {
  // Bound the cache size: drop oldest entries first.
  if (cache.entries.length > MAX_ENTRIES) {
    cache.entries.sort((a, b) => (a.storedAt < b.storedAt ? -1 : 1));
    cache.entries = cache.entries.slice(-MAX_ENTRIES);
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
  } catch (err) {
    logger().debug(`could not write cache to ${path}: ${(err as Error)?.message ?? err}`);
  }
}

export function lookup(cache: CacheFile, key: string): Finding[] | null {
  const entry = cache.entries.find((e) => e.key === key);
  return entry ? entry.findings : null;
}

export function store(cache: CacheFile, key: string, findings: Finding[]): void {
  // Upsert: drop any existing entry for this key, then push.
  const idx = cache.entries.findIndex((e) => e.key === key);
  if (idx >= 0) cache.entries.splice(idx, 1);
  cache.entries.push({ key, findings, storedAt: new Date().toISOString() });
}
