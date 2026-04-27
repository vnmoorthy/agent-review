// Detector tests. Each detector is exercised against:
//   - a "bad" fixture where it should fire,
//   - a "good" fixture where it must not fire.
// These tests run without tree-sitter installed (the fallback parser is used).

import { describe, expect, it } from "vitest";

import { buildDiff, emptyProject } from "./helpers/build-diff.js";
import { runDetectors } from "../src/core/detectors/index.js";
import { TAXONOMY } from "../src/core/taxonomy/registry.js";

async function run(opts: {
  files: { path: string; before?: string; after: string }[];
  project?: any;
  detectorAllowlist?: string[];
}) {
  const diff = buildDiff(opts.files);
  return runDetectors({
    diff,
    project: opts.project ?? emptyProject(),
    detectorAllowlist: opts.detectorAllowlist,
    llmEnabled: false,
  });
}

describe("AR001 dead-code-introduced", () => {
  it("fires on an unreferenced new function", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function used() { return 1 }\nused()",
          after: "function used() { return 1 }\nfunction unused() { return 2 }\nused()",
        },
      ],
      detectorAllowlist: ["AR001"],
    });
    expect(findings.find((f) => f.detectorId === "AR001")).toBeTruthy();
  });
  it("does not fire when the function is referenced", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a(){ return 1 }",
          after: "function a(){ return 1 }\nfunction b(){ return a() + 1 }\nb()",
        },
      ],
      detectorAllowlist: ["AR001"],
    });
    expect(findings.find((f) => f.detectorId === "AR001")).toBeFalsy();
  });
});

describe("AR002 unused-imports", () => {
  it("fires on an unused TS import", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "import { useState } from 'react'\nuseState",
          after:
            "import { useState, useEffect, useMemo } from 'react'\nuseState\nuseEffect",
        },
      ],
      detectorAllowlist: ["AR002"],
    });
    expect(findings.some((f) => f.detectorId === "AR002")).toBe(true);
  });
  it("does not fire when all imports are used", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "import { a } from 'mod'\na",
          after: "import { a, b } from 'mod'\na\nb",
        },
      ],
      detectorAllowlist: ["AR002"],
    });
    expect(findings.find((f) => f.detectorId === "AR002")).toBeFalsy();
  });
});

describe("AR003 commented-out-code", () => {
  it("fires on multiple consecutive code-ish comments", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a() { return 1 }",
          after:
            "// const x = 1; const y = 2;\n// function old() { return 1 }\nfunction a() { return 1 }",
        },
      ],
      detectorAllowlist: ["AR003"],
    });
    expect(findings.some((f) => f.detectorId === "AR003")).toBe(true);
  });
});

describe("AR005 hallucinated-import", () => {
  it("fires on an unknown package", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.py",
          before: "import json",
          after: "import json\nimport pyjwt_lite",
        },
      ],
      project: emptyProject(),
      detectorAllowlist: ["AR005"],
    });
    expect(findings.some((f) => f.detectorId === "AR005")).toBe(true);
  });
  it("does not fire on stdlib", async () => {
    const findings = await run({
      files: [{ path: "src/foo.py", before: "", after: "import os\nimport json" }],
      detectorAllowlist: ["AR005"],
    });
    expect(findings.find((f) => f.detectorId === "AR005")).toBeFalsy();
  });
});

describe("AR006 hallucinated-method", () => {
  it("fires on `array.contains()` in JS", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "const xs = [1,2]",
          after: "const xs = [1,2]\nif (xs.contains(2)) { console.warn('!') }",
        },
      ],
      detectorAllowlist: ["AR006"],
    });
    expect(findings.some((f) => f.detectorId === "AR006")).toBe(true);
  });
});

describe("AR010 test-without-assertion", () => {
  it("fires on an empty test", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.test.ts",
          before: "",
          after: "test('does a thing', () => {\n  const r = doIt()\n})",
        },
      ],
      detectorAllowlist: ["AR010"],
    });
    expect(findings.some((f) => f.detectorId === "AR010")).toBe(true);
  });
  it("does not fire when there is an expect", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.test.ts",
          before: "",
          after:
            "test('does a thing', () => {\n  const r = doIt()\n  expect(r).toBe(1)\n})",
        },
      ],
      detectorAllowlist: ["AR010"],
    });
    expect(findings.find((f) => f.detectorId === "AR010")).toBeFalsy();
  });
});

describe("AR011 mock-leaked", () => {
  it("fires on TODO_REPLACE in non-test code", async () => {
    const findings = await run({
      files: [
        {
          path: "src/api.ts",
          before: "const url = process.env.API_URL",
          after: "const url = 'https://mockapi.local' /* TODO_REPLACE */",
        },
      ],
      detectorAllowlist: ["AR011"],
    });
    expect(findings.some((f) => f.detectorId === "AR011")).toBe(true);
  });
});

describe("AR012 console-log-debug", () => {
  it("fires on a new console.log", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a(){return 1}",
          after: "function a(){console.log('a'); return 1}",
        },
      ],
      detectorAllowlist: ["AR012"],
    });
    expect(findings.some((f) => f.detectorId === "AR012")).toBe(true);
  });
  it("does not fire in scripts/", async () => {
    const findings = await run({
      files: [
        {
          path: "scripts/check.ts",
          before: "",
          after: "console.log('starting')",
        },
      ],
      detectorAllowlist: ["AR012"],
    });
    expect(findings.find((f) => f.detectorId === "AR012")).toBeFalsy();
  });
});

describe("AR013 todo-introduced", () => {
  it("fires on a new TODO comment", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a(){ return 1 }",
          after: "// TODO: handle weird input\nfunction a(){ return 1 }",
        },
      ],
      detectorAllowlist: ["AR013"],
    });
    expect(findings.some((f) => f.detectorId === "AR013")).toBe(true);
  });
});

describe("AR017 silent-catch", () => {
  it("fires on an empty catch", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a(){ b() }",
          after: "function a(){ try { b() } catch (e) { } }",
        },
      ],
      detectorAllowlist: ["AR017"],
    });
    expect(findings.some((f) => f.detectorId === "AR017")).toBe(true);
  });
});

describe("AR018 hardcoded-credential", () => {
  it("fires on an obvious API key pattern", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "const k = process.env.K",
          after: "const k = 'sk-ant-1234567890abcdefghij1234567890abcdefghij'",
        },
      ],
      detectorAllowlist: ["AR018"],
    });
    expect(findings.some((f) => f.detectorId === "AR018")).toBe(true);
  });
  it("ignores fixture directories", async () => {
    const findings = await run({
      files: [
        {
          path: "test/fixtures/bad/AR018/before.ts",
          before: "",
          after: "const k = 'sk-1234567890abcdefghij1234567890abcdefghij'",
        },
      ],
      detectorAllowlist: ["AR018"],
    });
    expect(findings.find((f) => f.detectorId === "AR018")).toBeFalsy();
  });
});

describe("AR019 broad-except", () => {
  it("fires on bare except: in Python", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.py",
          before: "def a():\n    try:\n        b()\n    except KeyError:\n        c()",
          after: "def a():\n    try:\n        b()\n    except:\n        c()",
        },
      ],
      detectorAllowlist: ["AR019"],
    });
    expect(findings.some((f) => f.detectorId === "AR019")).toBe(true);
  });
});

describe("AR021 sleep-in-test", () => {
  it("fires on setTimeout in a test", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.test.ts",
          before: "",
          after: "test('x', async () => { await new Promise(r => setTimeout(r, 100)) })",
        },
      ],
      detectorAllowlist: ["AR021"],
    });
    expect(findings.some((f) => f.detectorId === "AR021")).toBe(true);
  });
});

describe("AR025 disabled-test", () => {
  it("fires on it.skip", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.test.ts",
          before: "",
          after: "it.skip('refunds', () => { expect(1).toBe(1) })",
        },
      ],
      detectorAllowlist: ["AR025"],
    });
    expect(findings.some((f) => f.detectorId === "AR025")).toBe(true);
  });
});

describe("AR002 unused-imports", () => {
  it("does NOT auto-apply when other imports on the line are still used", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "import { a } from 'mod'\na",
          after: "import { a, b } from 'mod'\na",
        },
      ],
      detectorAllowlist: ["AR002"],
    });
    const f = findings.find((x) => x.detectorId === "AR002");
    expect(f).toBeTruthy();
    expect(f?.suggestion?.kind).toBe("text-only");
  });
  it("does auto-apply when the import is alone on the line", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function used() { return 1 }",
          after: "import unused from 'mod'\nfunction used() { return 1 }",
        },
      ],
      detectorAllowlist: ["AR002"],
    });
    const f = findings.find((x) => x.detectorId === "AR002");
    expect(f?.suggestion?.kind).toBe("remove-lines");
    expect(f?.confidence).toBe("high");
  });
});

describe("AR007 phantom-type", () => {
  it("removes the whole interface block via suggestion endLine", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a() { return 1 }",
          after: "interface PhantomShape {\n  id: string\n}\nfunction a() { return 1 }",
        },
      ],
      detectorAllowlist: ["AR007"],
    });
    const f = findings.find((x) => x.detectorId === "AR007");
    expect(f).toBeTruthy();
    expect(f?.suggestion?.startLine).toBe(1);
    expect(f?.suggestion?.endLine).toBeGreaterThanOrEqual(3);
  });
});

describe("AR017 silent-catch ignores annotated catches", () => {
  it("does not fire when the comment says 'intentional'", async () => {
    const findings = await run({
      files: [
        {
          path: "src/foo.ts",
          before: "function a(){ b() }",
          after:
            "function a(){\n  try { b() } catch (e) { /* intentional: b throws on cold start */ }\n}",
        },
      ],
      detectorAllowlist: ["AR017"],
    });
    expect(findings.find((x) => x.detectorId === "AR017")).toBeFalsy();
  });
});

describe("Taxonomy registry", () => {
  it("has 35 entries with stable IDs", () => {
    expect(TAXONOMY.length).toBe(35);
    const ids = TAXONOMY.map((t) => t.id);
    expect(new Set(ids).size).toBe(35);
    expect(ids[0]).toBe("AR001");
    expect(ids[ids.length - 1]).toBe("AR035");
  });
  it("every ID maps to a known category and severity", () => {
    const validCategories = new Set([
      "dead-code",
      "drive-by",
      "hallucination",
      "spec-drift",
      "test-quality",
      "style-drift",
      "safety",
      "secrets",
      "concurrency",
      "other",
    ]);
    const validSev = new Set(["info", "low", "medium", "high", "critical"]);
    for (const t of TAXONOMY) {
      expect(validCategories.has(t.category)).toBe(true);
      expect(validSev.has(t.severity)).toBe(true);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});
