// AR002 — import added in this diff that's not used anywhere in the file.
//
// We parse imports per language and check whether each imported binding is
// referenced in the rest of the file. JSX components are handled via the
// loose check that any reference (including in JSX) counts.

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile } from "../../git/files.js";
import { contentReferences, makeFinding } from "../helpers.js";

interface ImportBinding {
  name: string;
  line: number;
  source?: string;
}

function parseTsJsImports(content: string, lineFilter: Set<number>): ImportBinding[] {
  const out: ImportBinding[] = [];
  const lines = content.split("\n");
  // Track whether we're inside a template literal across lines, so we don't
  // pick up "imports" inside string fixtures.
  let inBacktick = false;
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";
    const wasInBacktick = inBacktick;
    // Toggle backtick state line-by-line, ignoring escaped backticks.
    for (let c = 0; c < line.length; c++) {
      if (line[c] === "\\") {
        c++;
        continue;
      }
      if (line[c] === "`") inBacktick = !inBacktick;
    }
    if (wasInBacktick) continue;
    if (!lineFilter.has(lineNum)) continue;
    // Multi-line imports are handled by greedy re-read; we approximate.
    const m1 = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/);
    if (m1) {
      out.push({ name: m1[1] ?? "", line: lineNum, source: m1[2] });
      continue;
    }
    const m2 = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/);
    if (m2) {
      out.push({ name: m2[1] ?? "", line: lineNum, source: m2[2] });
      continue;
    }
    const m3 = line.match(/^\s*import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/);
    if (m3) {
      const inside = m3[1] ?? "";
      const src = m3[2];
      for (const part of inside.split(",")) {
        const t = part.trim();
        if (!t) continue;
        // Support `foo as bar`.
        const asMatch = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (asMatch) {
          const name = asMatch[2] ?? asMatch[1] ?? "";
          if (name) out.push({ name, line: lineNum, source: src });
        }
      }
    }
  }
  return out;
}

function parsePyImports(content: string, lineFilter: Set<number>): ImportBinding[] {
  const out: ImportBinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (!lineFilter.has(lineNum)) continue;
    const line = lines[i] ?? "";
    const m1 = line.match(/^\s*import\s+([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_][\w]*))?/);
    if (m1) {
      const name = m1[2] ?? (m1[1] ?? "").split(".")[0] ?? "";
      if (name) out.push({ name, line: lineNum });
      continue;
    }
    const m2 = line.match(/^\s*from\s+[A-Za-z_.][\w.]*\s+import\s+(.+)$/);
    if (m2) {
      const inside = (m2[1] ?? "").replace(/\(|\)/g, "");
      for (const part of inside.split(",")) {
        const t = part.trim();
        if (!t) continue;
        const asMatch = t.match(/^([A-Za-z_][\w]*)(?:\s+as\s+([A-Za-z_][\w]*))?$/);
        if (asMatch) {
          const name = asMatch[2] ?? asMatch[1] ?? "";
          if (name && name !== "*") out.push({ name, line: lineNum });
        }
      }
    }
  }
  return out;
}

export const detector: Detector = {
  id: "AR002",
  category: "dead-code",
  title: "Unused imports",
  applies: (ctx) => isLanguageFile(ctx.filePath) && !!ctx.newContent,
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    const content = ctx.newContent;
    if (!content) return [];

    let imports: ImportBinding[] = [];
    if (lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx") {
      imports = parseTsJsImports(content, ctx.changedLines);
    } else if (lang === "py") {
      imports = parsePyImports(content, ctx.changedLines);
    } else {
      return [];
    }

    const findings: Finding[] = [];
    for (const imp of imports) {
      if (!imp.name) continue;
      // Strip the import line itself from the body before searching.
      const body = stripLine(content, imp.line);
      if (contentReferences(body, imp.name)) continue;
      // Auto-removable only when this import binding is alone on its line
      // (no risk of clipping another binding that's still used).
      const lineText = (content.split("\n")[imp.line - 1] ?? "").trim();
      const isAlone =
        /^import\s+[A-Za-z_$][\w$]*\s+from\s+["'][^"']+["']/.test(lineText) ||
        /^import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+["'][^"']+["']/.test(lineText) ||
        /^import\s+\{\s*[A-Za-z_$][\w$]*\s*\}\s+from\s+["'][^"']+["']/.test(lineText) ||
        /^(?:import\s+\w+|from\s+[\w.]+\s+import\s+\w+)$/.test(lineText);
      const suggestion = isAlone
        ? { kind: "remove-lines" as const, startLine: imp.line, endLine: imp.line }
        : {
            kind: "text-only" as const,
            text: `Remove the unused import \`${imp.name}\` from this line.`,
          };
      findings.push(
        makeFinding("AR002", ctx, {
          line: imp.line,
          endLine: imp.line,
          message: `Import \`${imp.name}\` is not used in this file.`,
          confidence: isAlone ? "high" : "medium",
          suggestion,
        })
      );
    }
    return findings;
  },
};

function stripLine(content: string, line: number): string {
  const lines = content.split("\n");
  lines[line - 1] = "";
  return lines.join("\n");
}
