import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadConfigFile,
  resolveRule,
  shouldSkipPath,
  globMatch,
} from "../src/core/config-file.js";

describe("config-file", () => {
  it("loads a valid config", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-cfg-"));
    writeFileSync(
      join(dir, ".agent-review.json"),
      JSON.stringify({
        exclude: ["dist/**"],
        rules: { AR014: "off", AR020: { severity: "low" } },
        failOn: "high",
      })
    );
    const cfg = loadConfigFile(dir);
    expect(cfg).toBeTruthy();
    expect(cfg?.rules?.AR014).toBe("off");
  });

  it("rejects an invalid config", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-cfg-"));
    writeFileSync(join(dir, ".agent-review.json"), JSON.stringify({ failOn: "bogus" }));
    expect(() => loadConfigFile(dir)).toThrow(/Invalid config/);
  });

  it("returns null when no config file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-cfg-"));
    expect(loadConfigFile(dir)).toBeNull();
  });

  it("resolveRule applies overrides", () => {
    const cfg: any = { rules: { AR014: "off", AR020: { severity: "high" } } };
    expect(resolveRule(cfg, "AR014", "low").enabled).toBe(false);
    expect(resolveRule(cfg, "AR020", "low").severity).toBe("high");
    expect(resolveRule(cfg, "AR099", "medium")).toEqual({
      enabled: true,
      severity: "medium",
    });
  });

  it("shouldSkipPath honors exclude/include", () => {
    expect(shouldSkipPath({ exclude: ["dist/**"] }, "dist/foo.ts")).toBe(true);
    expect(shouldSkipPath({ exclude: ["dist/**"] }, "src/foo.ts")).toBe(false);
    expect(shouldSkipPath({ include: ["src/**"] }, "scripts/foo.ts")).toBe(true);
    expect(shouldSkipPath({ include: ["src/**"] }, "src/foo.ts")).toBe(false);
  });

  it("globMatch handles ** and *", () => {
    expect(globMatch("dist/**", "dist/foo/bar.ts")).toBe(true);
    expect(globMatch("**/*.test.ts", "src/foo.test.ts")).toBe(true);
    expect(globMatch("*.json", "package.json")).toBe(true);
    expect(globMatch("*.json", "src/foo.json")).toBe(true);
  });
});
