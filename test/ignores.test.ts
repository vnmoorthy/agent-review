import { describe, it, expect } from "vitest";

import { buildDiff, emptyProject } from "./helpers/build-diff.js";
import { runDetectors } from "../src/core/detectors/index.js";
import { parseIgnoreDirectives, isFindingIgnored } from "../src/core/ignores.js";

describe("Inline ignore directives", () => {
  it("ignore-next-line suppresses one detector", async () => {
    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/foo.ts",
          before: "function a(){}",
          after:
            "function a(){\n  // agent-review-ignore-next-line AR012\n  console.log('debug')\n}",
        },
      ]),
      project: emptyProject(),
      detectorAllowlist: ["AR012"],
      llmEnabled: false,
    });
    expect(findings.find((f) => f.detectorId === "AR012")).toBeFalsy();
  });

  it("ignore-line with no IDs suppresses all detectors on that line", async () => {
    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/foo.ts",
          before: "x",
          after: "console.log('debug') // agent-review-ignore-line",
        },
      ]),
      project: emptyProject(),
      detectorAllowlist: ["AR012"],
      llmEnabled: false,
    });
    expect(findings.length).toBe(0);
  });

  it("ignore-file with IDs suppresses across the whole file", async () => {
    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/foo.ts",
          before: "x",
          after:
            "// agent-review-ignore-file AR012\nconsole.log('a')\nconsole.log('b')",
        },
      ]),
      project: emptyProject(),
      detectorAllowlist: ["AR012"],
      llmEnabled: false,
    });
    expect(findings.length).toBe(0);
  });

  it("disable/enable block suppresses within the block", async () => {
    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/foo.ts",
          before: "x",
          after:
            "console.log('a')\n// agent-review-disable AR012\nconsole.log('b')\nconsole.log('c')\n// agent-review-enable\nconsole.log('d')",
        },
      ]),
      project: emptyProject(),
      detectorAllowlist: ["AR012"],
      llmEnabled: false,
    });
    // Two console.logs are inside the disable block; one before, one after.
    expect(findings.length).toBe(2);
  });

  it("doesn't suppress when ID doesn't match", async () => {
    const findings = await runDetectors({
      diff: buildDiff([
        {
          path: "src/foo.ts",
          before: "x",
          after: "// agent-review-ignore-next-line AR017\nconsole.log('debug')",
        },
      ]),
      project: emptyProject(),
      detectorAllowlist: ["AR012"],
      llmEnabled: false,
    });
    expect(findings.length).toBe(1);
  });

  it("supports python # comment syntax", async () => {
    const info = parseIgnoreDirectives(
      "# agent-review-ignore-next-line AR012\nprint('debug')"
    );
    expect(info.perLine.has(2)).toBe(true);
  });
});

describe("isFindingIgnored", () => {
  it("returns true when line is fully suppressed", () => {
    const info = parseIgnoreDirectives(
      "console.log('a') // agent-review-ignore-line"
    );
    const fakeFinding: any = { file: "foo.ts", line: 1, detectorId: "AR012" };
    expect(isFindingIgnored(fakeFinding, info)).toBe(true);
  });
});
