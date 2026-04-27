// agent-review configuration file loader.
//
// We accept any of these names at the repo root, in priority order:
//   .agent-review.json
//   agent-review.config.json
//   .agent-review.config.json
//
// The schema is documented in docs/config.md and validated with zod so
// invalid configs produce a clear error.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { Severity } from "./detectors/types.js";

const SeverityEnum = z.enum(["info", "low", "medium", "high", "critical"]);

const DetectorRuleSchema = z.union([
  z.literal("off"),
  z.literal("on"),
  z.object({
    severity: SeverityEnum.optional(),
    enabled: z.boolean().optional(),
  }),
]);

export const ConfigFileSchema = z.object({
  // Glob-style patterns for files to skip entirely.
  exclude: z.array(z.string()).optional(),
  // Glob-style patterns for files to focus on (if set, only these are reviewed).
  include: z.array(z.string()).optional(),
  // Per-detector overrides: { "AR001": "off" } or { "AR012": { "severity": "high" } }.
  rules: z.record(z.string(), DetectorRuleSchema).optional(),
  // Default minimum severity to show.
  severity: SeverityEnum.optional(),
  // Exit-code policy.
  failOn: z.enum(["never", "any", "high", "critical"]).optional(),
  // LLM provider settings.
  llm: z
    .object({
      enabled: z.boolean().optional(),
      provider: z.enum(["anthropic", "ollama", "none"]).optional(),
      model: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
  // Paths (relative to repo root) to load custom detectors from.
  // Each path should export `detector: Detector` or `detectors: Detector[]`.
  customDetectors: z.array(z.string()).optional(),
  // Where to keep the baseline file.
  baselineFile: z.string().optional(),
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export type DetectorRule = z.infer<typeof DetectorRuleSchema>;

const CANDIDATES = [
  ".agent-review.json",
  "agent-review.config.json",
  ".agent-review.config.json",
];

export function findConfigFile(repoRoot: string): string | null {
  for (const name of CANDIDATES) {
    const p = join(repoRoot, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadConfigFile(repoRoot: string): ConfigFile | null {
  const path = findConfigFile(repoRoot);
  if (!path) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not parse ${path}: ${(err as Error)?.message ?? err}`
    );
  }
  const parsed = ConfigFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid config in ${path}:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }
  return parsed.data;
}

// Resolve effective severity / enablement for a detector ID given the config.
export function resolveRule(
  config: ConfigFile | null,
  detectorId: string,
  defaultSeverity: Severity
): { enabled: boolean; severity: Severity } {
  const rule = config?.rules?.[detectorId];
  if (rule === undefined || rule === "on") {
    return { enabled: true, severity: defaultSeverity };
  }
  if (rule === "off") return { enabled: false, severity: defaultSeverity };
  return {
    enabled: rule.enabled !== false,
    severity: rule.severity ?? defaultSeverity,
  };
}

// Glob match (very basic, supports **, *, and ?).
export function globMatch(pattern: string, path: string): boolean {
  const p = pattern;
  // Anchor logic: if the pattern doesn't start with '/' or '**', allow match anywhere.
  const re = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<DOUBLE_STAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLE_STAR>>/g, ".*")
    .replace(/\?/g, "[^/]");
  const regex = new RegExp(`(^|/)${re}$`);
  return regex.test(path);
}

export function shouldSkipPath(config: ConfigFile | null, path: string): boolean {
  if (!config) return false;
  if (config.exclude?.some((pat) => globMatch(pat, path))) return true;
  if (config.include && config.include.length > 0) {
    return !config.include.some((pat) => globMatch(pat, path));
  }
  return false;
}
