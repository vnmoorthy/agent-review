// Helpers to render human-readable suggestions for findings whose suggestion
// is `text-only`. We treat these as advisory regardless of `--apply-safe`.

import type { Finding } from "../detectors/types.js";

export function renderSuggestion(f: Finding): string {
  if (!f.suggestion) return "";
  switch (f.suggestion.kind) {
    case "text-only":
      return f.suggestion.text ?? "";
    case "remove-lines":
      return `Remove lines ${f.suggestion.startLine}-${f.suggestion.endLine}.`;
    case "add-import":
      return `Add import: ${f.suggestion.importStatement}`;
    case "replace-range":
      return `Replace lines ${f.suggestion.startLine}-${f.suggestion.endLine}.`;
  }
  return "";
}
