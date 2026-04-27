import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import { loadCustomDetectors } from "../src/core/plugins.js";
import { runDetectors } from "../src/core/detectors/index.js";
import { buildDiff, emptyProject } from "./helpers/build-diff.js";

describe("custom detectors", () => {
  it("loads a custom detector and runs it through the runner", async () => {
    const detectors = await loadCustomDetectors(__dirname, [
      "fixtures/plugins/no-cron.js",
    ]);
    expect(detectors.length).toBe(1);
    expect(detectors[0]?.id).toBe("CUSTOM_NO_CRON");

    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/scheduler.ts",
          before: "function tick() {}",
          after: "import job from 'cron'\nfunction tick() {}",
        },
      ]),
      project: emptyProject(),
      llmEnabled: false,
      customDetectors: detectors,
    });
    expect(findings.find((f) => f.detectorId === "CUSTOM_NO_CRON")).toBeTruthy();
  });

  it("rejects detectors with invalid IDs", async () => {
    const fakeMod = `
      module.exports.detector = {
        id: "AR999",
        category: "x",
        title: "x",
        applies: () => true,
        run: () => [],
      };
    `;
    const fs = await import("node:fs");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(resolve(os.tmpdir(), "ar-plugin-"));
    const path = resolve(dir, "bad.js");
    fs.writeFileSync(path, fakeMod);
    const detectors = await loadCustomDetectors(dir, [path]);
    // The bad detector is rejected; result is empty.
    expect(detectors.length).toBe(0);
  });
});
