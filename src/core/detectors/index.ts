// Detector registry + runner.

import type { Detector, DetectorContext, Finding } from "./types.js";
import { logger } from "../logger.js";
import type { ParsedDiff } from "../git/diff.js";
import type { ProjectInfo } from "./types.js";
import { detectLang } from "../git/files.js";
import { parseSource } from "../ast/loaders.js";

import { detector as deadCode } from "./static/dead-code.js";
import { detector as unusedImports } from "./static/unused-imports.js";
import { detector as commentedOut } from "./static/commented-out-code.js";
import { detector as driveBy } from "./static/drive-by-refactor.js";
import { detector as hallucinatedImport } from "./static/hallucinated-import.js";
import { detector as hallucinatedMethod } from "./static/hallucinated-method.js";
import { detector as phantomType } from "./static/phantom-type.js";
import { detector as overDefensive } from "./static/over-defensive.js";
import { detector as staleComment } from "./static/stale-comment.js";
import { detector as testWithoutAssertion } from "./static/test-without-assertion.js";
import { detector as mockLeaked } from "./static/mock-leaked.js";
import { detector as consoleLog } from "./static/console-log-debug.js";
import { detector as todoIntroduced } from "./static/todo-introduced.js";
import { detector as inconsistentNaming } from "./static/inconsistent-naming.js";
import { detector as duplicateError } from "./static/duplicate-error-handling.js";
import { detector as orphanFiles } from "./static/orphan-files.js";
import { detector as silentCatch } from "./static/silent-catch.js";
import { detector as hardcodedCred } from "./static/hardcoded-credential.js";
import { detector as broadExcept } from "./static/broad-except.js";
import { detector as magicNumber } from "./static/magic-number.js";
import { detector as sleepInTest } from "./static/sleep-in-test.js";
import { detector as unawaitedPromise } from "./static/unawaited-promise.js";
import { detector as mutatedInput } from "./static/mutated-input.js";
import { detector as importCycle } from "./static/import-cycle.js";
import { detector as disabledTest } from "./static/disabled-test.js";

import { llmDetectorBatch } from "./llm/index.js";
import { applyIgnores } from "../ignores.js";
import {
  type ConfigFile,
  resolveRule,
  shouldSkipPath,
} from "../config-file.js";
import { getTaxonomyEntry } from "../taxonomy/registry.js";
import {
  buildCacheKey,
  cachePath,
  loadCache,
  lookup as cacheLookup,
  saveCache,
  store as cacheStore,
} from "../cache.js";
import { isGitignored, loadGitignoreRules } from "../gitignore.js";

export const STATIC_DETECTORS: Detector[] = [
  deadCode,
  unusedImports,
  commentedOut,
  driveBy,
  hallucinatedImport,
  hallucinatedMethod,
  phantomType,
  overDefensive,
  staleComment,
  testWithoutAssertion,
  mockLeaked,
  consoleLog,
  todoIntroduced,
  inconsistentNaming,
  duplicateError,
  orphanFiles,
  silentCatch,
  hardcodedCred,
  broadExcept,
  magicNumber,
  sleepInTest,
  unawaitedPromise,
  mutatedInput,
  importCycle,
  disabledTest,
];

export interface RunnerOptions {
  diff: ParsedDiff;
  project: ProjectInfo;
  detectorAllowlist?: string[];
  detectorDenylist?: string[];
  llmEnabled: boolean;
  llmConfig?: {
    provider: "anthropic" | "ollama" | "openai" | "none";
    model: string;
    apiKey?: string;
    baseUrl?: string;
    timeoutMs: number;
    maxRetries: number;
    maxFiles?: number;
  };
  // Optional project config (severity overrides, exclude paths, custom detectors).
  config?: ConfigFile | null;
  // Custom detectors loaded from config.customDetectors.
  customDetectors?: Detector[];
  // Skip the persistent finding cache (default: cache enabled when repoRoot is writeable).
  noCache?: boolean;
  // Tool version stamped into cache keys so a release invalidates stale entries.
  toolVersion?: string;
}

export async function runDetectors(opts: RunnerOptions): Promise<Finding[]> {
  const log = logger().child("runner");
  const findings: Finding[] = [];
  const allDetectors = [...STATIC_DETECTORS, ...(opts.customDetectors ?? [])];
  const detectorsToRun = allDetectors.filter((d) => {
    if (opts.detectorAllowlist && !opts.detectorAllowlist.includes(d.id)) return false;
    if (opts.detectorDenylist && opts.detectorDenylist.includes(d.id)) return false;
    // Respect config rule overrides.
    if (opts.config?.rules?.[d.id]) {
      const taxonomy = getTaxonomyEntry(d.id);
      const defSev = taxonomy?.severity ?? "medium";
      const resolved = resolveRule(opts.config, d.id, defSev);
      if (!resolved.enabled) return false;
    }
    return true;
  });

  log.debug(
    `running ${detectorsToRun.length} static detectors on ${opts.diff.files.length} files`
  );

  // Load the persistent cache. Per-file cache keys hash the file content +
  // tool version + LLM-enabled flag, so re-runs against unchanged content
  // return instantly without invoking any detector.
  const cacheEnabled = !opts.noCache;
  const cFile = cacheEnabled ? cachePath(opts.diff.repoRoot) : null;
  const cache = cFile ? loadCache(cFile) : null;
  const toolVersion = opts.toolVersion ?? "0.1.0";
  let cacheTouched = false;

  // Auto-skip files that .gitignore already excludes from the repo.
  const gitignoreRules = loadGitignoreRules(opts.diff.repoRoot);

  for (const fd of opts.diff.files) {
    if (fd.binary) {
      log.debug(`skipping binary file: ${fd.path}`);
      continue;
    }
    if (shouldSkipPath(opts.config ?? null, fd.path)) {
      log.debug(`skipping by config: ${fd.path}`);
      continue;
    }
    if (isGitignored(fd.path, gitignoreRules)) {
      log.debug(`skipping (gitignored): ${fd.path}`);
      continue;
    }

    // Cache short-circuit: if we've analyzed this exact content before with
    // the same flags, replay the prior findings instead of re-running detectors.
    if (cache) {
      const key = buildCacheKey(fd.path, fd.newContent, toolVersion, opts.llmEnabled);
      const cached = cacheLookup(cache, key);
      if (cached) {
        log.debug(`cache hit: ${fd.path}`);
        for (const f of cached) findings.push(f);
        continue;
      }
    }

    const lang = detectLang(fd.path);
    const ast =
      lang !== "other" && fd.newContent
        ? parseSource(fd.newContent, lang)
        : undefined;

    const changedLines = new Set<number>(fd.addedLines);
    const ctx: DetectorContext = {
      filePath: fd.path,
      diff: opts.diff,
      fileDiff: fd,
      newContent: fd.newContent,
      oldContent: fd.oldContent,
      changedLines,
      repoRoot: opts.diff.repoRoot,
      ast,
      project: opts.project,
    };

    const fileFindings: Finding[] = [];
    for (const det of detectorsToRun) {
      if (!det.applies(ctx)) continue;
      try {
        const r = await det.run(ctx);
        for (const f of r) {
          findings.push(f);
          fileFindings.push(f);
        }
      } catch (err) {
        log.debug(`detector ${det.id} threw on ${fd.path}; skipping`, err);
      }
    }

    if (cache) {
      const key = buildCacheKey(fd.path, fd.newContent, toolVersion, opts.llmEnabled);
      cacheStore(cache, key, fileFindings);
      cacheTouched = true;
    }
  }

  if (cache && cacheTouched && cFile) {
    saveCache(cFile, cache);
  }

  if (opts.llmEnabled && opts.llmConfig && opts.llmConfig.provider !== "none") {
    try {
      const llmFindings = await llmDetectorBatch(opts.diff, opts.llmConfig);
      for (const f of llmFindings) findings.push(f);
    } catch (err) {
      log.warn("LLM detectors failed; continuing with static-only results", err);
    }
  }

  // Apply config severity overrides.
  if (opts.config?.rules) {
    for (const f of findings) {
      const taxonomy = getTaxonomyEntry(f.detectorId);
      const def = taxonomy?.severity ?? f.severity;
      const resolved = resolveRule(opts.config, f.detectorId, def);
      if (resolved.severity !== f.severity) f.severity = resolved.severity;
    }
  }

  // Apply inline ignore directives (// agent-review-ignore-...).
  const contentByPath = new Map<string, string | undefined>();
  for (const fd of opts.diff.files) contentByPath.set(fd.path, fd.newContent);
  const filtered = applyIgnores(findings, contentByPath);
  const kept = filtered.kept;

  // Deterministic ordering: by file, then line, then detector ID.
  kept.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.detectorId < b.detectorId ? -1 : 1;
  });
  return kept;
}
