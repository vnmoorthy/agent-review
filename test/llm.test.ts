// Tests for the LLM-detector JSON parsing layer (no network calls).

import { describe, it, expect } from "vitest";
import { ReviewSchema } from "../src/core/llm/schemas/review.js";

describe("ReviewSchema", () => {
  it("accepts a well-formed response", () => {
    const ok = {
      findings: [
        {
          detectorId: "AR026",
          line: 10,
          message: "Inverted condition",
          confidence: "high",
          severity: "high",
        },
      ],
    };
    expect(ReviewSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown detector ids", () => {
    const bad = {
      findings: [{ detectorId: "AR999", line: 10, message: "bogus" }],
    };
    expect(ReviewSchema.safeParse(bad).success).toBe(false);
  });

  it("requires line >= 1", () => {
    const bad = {
      findings: [{ detectorId: "AR026", line: 0, message: "zero line" }],
    };
    expect(ReviewSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts an empty findings array", () => {
    expect(ReviewSchema.safeParse({ findings: [] }).success).toBe(true);
  });
});

describe("Config defaults", () => {
  it("detects no LLM provider when env is empty", async () => {
    const oldKey = process.env.ANTHROPIC_API_KEY;
    const oldUrl = process.env.OLLAMA_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    const { detectLlmProvider } = await import("../src/core/config.js");
    expect(detectLlmProvider()).toBe("none");
    if (oldKey) process.env.ANTHROPIC_API_KEY = oldKey;
    if (oldUrl) process.env.OLLAMA_BASE_URL = oldUrl;
  });
});

describe("Logger", () => {
  it("respects log level filtering", async () => {
    const { createLogger } = await import("../src/core/logger.js");
    const log = createLogger("error");
    expect(log.level).toBe("error");
  });
});
