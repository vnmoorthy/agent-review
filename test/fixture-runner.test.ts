// Drives detectors against the on-disk fixtures under test/fixtures/bad/.
// Each fixture is a (before, after) pair that should fire its detector.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { buildDiff, emptyProject } from "./helpers/build-diff.js";
import { runDetectors } from "../src/core/detectors/index.js";

const fixturesDir = join(__dirname, "fixtures");

interface Fixture {
  detectorId: string;
  before: string;
  after: string;
  ext: string;
  // Optional: extra files to include in the diff (for cross-file detectors).
  extraFiles?: { path: string; before?: string; after: string }[];
  // Optional: project info overrides (e.g. snake_case convention for AR014).
  project?: any;
}

function readFixture(detectorId: string): Fixture | null {
  const dir = join(fixturesDir, "bad", detectorId);
  if (!existsSync(dir)) return null;
  const before = readFileSync(join(dir, "before.txt"), "utf8");
  const after = readFileSync(join(dir, "after.txt"), "utf8");

  // Pick a sensible extension per detector.
  let ext = "ts";
  let extraFiles: Fixture["extraFiles"] = undefined;
  let project: any = undefined;

  if (detectorId === "AR005") ext = "py";
  if (detectorId === "AR014") {
    ext = "py";
    project = emptyProject({ conventions: { js: "unknown", py: "snake_case" } });
  }
  if (detectorId === "AR019") ext = "py";

  // AR004 needs >=2 files in the diff (unrelated drive-by detection).
  if (detectorId === "AR004") {
    extraFiles = [{ path: "src/other.ts", before: "x", after: "x\nconsole.warn('a')\nconst y = 2\nreturn y" }];
  }
  // AR016 (orphan file): the new file isn't imported anywhere.
  if (detectorId === "AR016") {
    // No need for extras; orphan-ness is satisfied by the fixture being added.
  }
  // AR024 needs both files to be in the same dir for relative import
  // resolution. Use src/a.ts and src/b.ts at the same depth.
  if (detectorId === "AR024") {
    extraFiles = [
      {
        path: "src/b.ts",
        before: "export function b(){}",
        after:
          "import { a } from './a'\nexport function b(){ return a }",
      },
    ];
  }

  return { detectorId, before, after, ext, extraFiles, project };
}

// Detectors that only fire on test files; place fixture in a test path.
const TEST_FILE_DETECTORS = new Set(["AR010", "AR021", "AR025"]);

describe("Fixture runner", () => {
  const detectorDirs = existsSync(join(fixturesDir, "bad"))
    ? readdirSync(join(fixturesDir, "bad")).sort()
    : [];

  for (const det of detectorDirs) {
    const fix = readFixture(det);
    if (!fix) continue;
    it(`${det} fires on its bad fixture`, async () => {
      let path: string;
      if (det === "AR024") path = "src/a.ts";
      else if (TEST_FILE_DETECTORS.has(det))
        path = `src/sample_${det}.test.${fix.ext}`;
      else path = `src/sample_${det}.${fix.ext}`;

      const files = [
        { path, before: fix.before, after: fix.after },
        ...(fix.extraFiles ?? []),
      ];
      const diff = buildDiff(files);
      const findings = await runDetectors({
        diff,
        project: fix.project ?? emptyProject(),
        detectorAllowlist: [det],
        llmEnabled: false,
        noCache: true,
      });
      const matched = findings.find((f) => f.detectorId === det);
      if (!matched) {
        // eslint-disable-next-line no-console
        console.error(
          `${det}: no findings for fixture; full results:`,
          JSON.stringify(findings, null, 2)
        );
      }
      expect(matched).toBeTruthy();
    });
  }
});
