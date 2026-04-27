// Custom detector loader. Users specify paths in their config:
//
//   { "customDetectors": ["./detectors/no-cron.js", "./detectors/no-eval.js"] }
//
// Each module must export either:
//   export const detector: Detector
//   export const detectors: Detector[]
//
// Custom detector IDs MUST start with `CUSTOM` (e.g. CUSTOM_NO_CRON) so they
// don't collide with the built-in `AR0XX` taxonomy.

import { isAbsolute, resolve } from "node:path";
import { existsSync } from "node:fs";

import type { Detector } from "./detectors/types.js";
import { logger } from "./logger.js";

export async function loadCustomDetectors(
  repoRoot: string,
  paths: string[] | undefined
): Promise<Detector[]> {
  if (!paths || paths.length === 0) return [];
  const log = logger().child("plugins");
  const detectors: Detector[] = [];
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(repoRoot, p);
    if (!existsSync(abs)) {
      log.warn(`custom detector not found: ${abs}`);
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod: any = require(abs);
      const exported = mod.detector ?? mod.default ?? null;
      if (exported && typeof exported === "object" && "id" in exported && "run" in exported) {
        detectors.push(validate(exported));
        continue;
      }
      if (Array.isArray(mod.detectors)) {
        for (const d of mod.detectors) detectors.push(validate(d));
        continue;
      }
      log.warn(`${abs} did not export a detector or detectors array`);
    } catch (err) {
      log.warn(`failed to load custom detector ${abs}: ${(err as Error)?.message ?? err}`);
    }
  }
  return detectors;
}

function validate(d: Detector): Detector {
  if (!d.id.startsWith("CUSTOM"))
    throw new Error(`Custom detector id must start with "CUSTOM": got "${d.id}"`);
  if (typeof d.applies !== "function" || typeof d.run !== "function")
    throw new Error(`Custom detector ${d.id} is missing applies/run`);
  return d;
}
