// LLM detector batch. One call per file, ten checks per call.

import type { Finding } from "../types.js";
import type { ParsedDiff } from "../../git/diff.js";
import { logger } from "../../logger.js";
import { callAnthropic } from "../../llm/anthropic.js";
import { callOllama } from "../../llm/ollama.js";
import { callOpenAI } from "../../llm/openai.js";
import { buildReviewPrompt, SYSTEM_PROMPT } from "../../llm/prompts/review.js";
import { ReviewSchema } from "../../llm/schemas/review.js";
import { getTaxonomyEntry } from "../../taxonomy/registry.js";
import { snippetAround } from "../../git/diff.js";

export interface LlmConfig {
  provider: "anthropic" | "ollama" | "openai" | "none";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  // Hard cap on total LLM calls per run. Default 200.
  maxFiles?: number;
}

const SKIP_DIRS = ["node_modules", "dist", "build", ".git"];

export async function llmDetectorBatch(
  diff: ParsedDiff,
  cfg: LlmConfig
): Promise<Finding[]> {
  const log = logger().child("llm");
  const findings: Finding[] = [];
  const maxFiles = cfg.maxFiles ?? 200;
  let filesAnalyzed = 0;

  for (const fd of diff.files) {
    if (fd.binary) continue;
    if (!fd.newContent) continue;
    if (SKIP_DIRS.some((d) => fd.path.includes(`${d}/`))) continue;
    if (fd.newContent.length > 200_000) {
      log.debug(`skipping ${fd.path}: too large for LLM review`);
      continue;
    }
    if (filesAnalyzed >= maxFiles) {
      log.warn(
        `LLM file cap reached (${maxFiles}). Skipping ${fd.path} and remaining files. Override with config.llm.maxFiles.`
      );
      break;
    }
    filesAnalyzed++;

    const diffSnippet = fd.hunks
      .map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join("\n")}`)
      .join("\n");

    const prompt = buildReviewPrompt({
      filePath: fd.path,
      diffSnippet,
      newContent: fd.newContent,
      oldContent: fd.oldContent,
    });

    let raw: string;
    try {
      if (cfg.provider === "anthropic") {
        if (!cfg.apiKey) {
          log.warn("ANTHROPIC_API_KEY not set; skipping LLM review");
          return findings;
        }
        const res = await callAnthropic({
          apiKey: cfg.apiKey,
          model: cfg.model,
          system: SYSTEM_PROMPT,
          user: prompt,
          maxTokens: 2048,
          temperature: 0,
          timeoutMs: cfg.timeoutMs,
          maxRetries: cfg.maxRetries,
        });
        raw = res.text;
      } else if (cfg.provider === "ollama") {
        if (!cfg.baseUrl) {
          log.warn("OLLAMA_BASE_URL not set; skipping LLM review");
          return findings;
        }
        const res = await callOllama({
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          system: SYSTEM_PROMPT,
          user: prompt,
          temperature: 0,
          timeoutMs: cfg.timeoutMs,
          maxRetries: cfg.maxRetries,
        });
        raw = res.text;
      } else if (cfg.provider === "openai") {
        if (!cfg.apiKey) {
          log.warn("OPENAI_API_KEY not set; skipping LLM review");
          return findings;
        }
        const res = await callOpenAI({
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl ?? "https://api.openai.com",
          model: cfg.model,
          system: SYSTEM_PROMPT,
          user: prompt,
          temperature: 0,
          maxTokens: 2048,
          timeoutMs: cfg.timeoutMs,
          maxRetries: cfg.maxRetries,
        });
        raw = res.text;
      } else {
        return findings;
      }
    } catch (err) {
      log.warn(`LLM review for ${fd.path} failed: ${(err as Error)?.message ?? err}`);
      continue;
    }

    const parsed = parseModelJson(raw);
    if (!parsed) {
      log.warn(`could not parse LLM response for ${fd.path}`);
      continue;
    }

    for (const f of parsed.findings) {
      const entry = getTaxonomyEntry(f.detectorId);
      if (!entry) continue;
      findings.push({
        detectorId: f.detectorId,
        category: entry.category,
        title: entry.title,
        file: fd.path,
        line: f.line,
        endLine: f.endLine ?? f.line,
        severity: f.severity ?? entry.severity,
        message: f.message,
        excerpt: snippetAround(fd.newContent, f.line, 3),
        confidence: f.confidence ?? "medium",
        rationale: f.rationale,
      });
    }
  }

  return findings;
}

// Models sometimes wrap JSON in code fences or include leading prose. We
// extract the first valid JSON object we can find.
function parseModelJson(raw: string): { findings: any[] } | null {
  if (!raw) return null;
  // Strip code fences.
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1] ?? cleaned;
  // Find first `{`.
  const idx = cleaned.indexOf("{");
  if (idx < 0) return null;
  // Try to parse from the first `{` to the last `}`.
  const last = cleaned.lastIndexOf("}");
  if (last < idx) return null;
  const candidate = cleaned.slice(idx, last + 1);
  try {
    const parsed = JSON.parse(candidate);
    const result = ReviewSchema.safeParse(parsed);
    if (result.success) return result.data;
    return null;
  } catch {
    return null;
  }
}
