// File path utilities.

import { extname } from "node:path";

export type Lang = "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "rust" | "other";

export function detectLang(path: string): Lang {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".ts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".cjs":
    case ".mjs":
      return "js";
    case ".jsx":
      return "jsx";
    case ".py":
      return "py";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    default:
      return "other";
  }
}

export function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes("/test/") || lower.includes("/tests/") || lower.includes("/__tests__/"))
    return true;
  if (
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(lower) ||
    /test_.*\.py$/.test(lower) ||
    /_test\.go$/.test(lower) ||
    /tests?\.rs$/.test(lower)
  ) {
    return true;
  }
  return false;
}

export function isLanguageFile(path: string): boolean {
  return detectLang(path) !== "other";
}
