// Runtime configuration for a single agent-review invocation.
// Built from CLI flags + environment.

import type { LogLevel } from "./logger.js";

export type DiffMode = "staged" | "last-commit" | "branch" | "working-tree";

export type LlmProvider = "anthropic" | "ollama" | "openai" | "none";

export interface RunConfig {
  cwd: string;
  diffMode: DiffMode;
  baseRef?: string;
  files?: string[];
  llm: {
    provider: LlmProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    timeoutMs: number;
    maxRetries: number;
  };
  applySafe: boolean;
  output: "terminal" | "json" | "markdown" | "sarif" | "github" | "junit" | "html";
  severityThreshold: "info" | "low" | "medium" | "high" | "critical";
  detectorAllowlist?: string[];
  detectorDenylist?: string[];
  logLevel: LogLevel;
  failOn: "never" | "any" | "high" | "critical";
  baseline: boolean;
  noColor: boolean;
}

export function defaultConfig(cwd: string): RunConfig {
  return {
    cwd,
    diffMode: "staged",
    llm: {
      provider: detectLlmProvider(),
      model: defaultModelFor(detectLlmProvider()),
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.OLLAMA_BASE_URL,
      timeoutMs: 60000,
      maxRetries: 1,
    },
    applySafe: false,
    output: "terminal",
    severityThreshold: "info",
    logLevel: "warn",
    failOn: "never",
    baseline: false,
    noColor: !process.stdout.isTTY,
  };
}

export function detectLlmProvider(): LlmProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  return "none";
}

export function defaultModelFor(provider: LlmProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude-haiku-4-5-20251001";
    case "openai":
      return "gpt-4o-mini";
    case "ollama":
      return "llama3.1:8b";
    case "none":
      return "";
  }
}

export function defaultBaseUrlFor(provider: LlmProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
    case "ollama":
      return process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    default:
      return undefined;
  }
}
