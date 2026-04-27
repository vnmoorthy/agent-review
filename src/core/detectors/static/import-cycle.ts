// AR024 — new import edge that creates a cycle in the module graph (within
// the diff scope; we don't crawl the whole repo to keep this fast).

import type { Detector, Finding } from "../types.js";
import { detectLang } from "../../git/files.js";
import { addedLineNumbers, makeFinding } from "../helpers.js";
import { dirname, resolve } from "node:path";

interface ImportEdge {
  from: string;
  to: string;
  line: number;
}

export const detector: Detector = {
  id: "AR024",
  category: "drive-by",
  title: "Import cycle introduced",
  applies: (ctx) => ["ts", "tsx", "js", "jsx"].includes(detectLang(ctx.filePath)),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    // Build a map of file -> imports across all files in the diff.
    const graph = new Map<string, Set<string>>();
    for (const f of ctx.diff.files) {
      if (!f.newContent) continue;
      const imports = collectImports(f.path, f.newContent);
      const set = new Set<string>();
      for (const imp of imports) set.add(imp.to);
      graph.set(f.path, set);
    }

    // Find cycles that include our file.
    const start = ctx.filePath;
    const ourImports = graph.get(start) ?? new Set();
    const ourAdded = collectImports(ctx.filePath, ctx.newContent).filter((e) =>
      addedLineNumbers(ctx).includes(e.line)
    );
    for (const edge of ourAdded) {
      if (hasCycleBack(edge.to, start, graph, new Set())) {
        findings.push(
          makeFinding("AR024", ctx, {
            line: edge.line,
            endLine: edge.line,
            message: `Importing \`${edge.to}\` creates a cycle back to \`${start}\`.`,
            confidence: "medium",
            suggestion: {
              kind: "text-only",
              text: "Extract the shared types or functions into a third module.",
            },
          })
        );
      }
    }
    return findings;
  },
};

function collectImports(path: string, content: string): ImportEdge[] {
  const out: ImportEdge[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m =
      (lines[i] ?? "").match(/from\s+["'](\.[^"']+)["']/) ||
      (lines[i] ?? "").match(/require\(\s*["'](\.[^"']+)["']\s*\)/);
    if (!m) continue;
    const spec = m[1] ?? "";
    const resolved = resolve(dirname(path), spec).replace(/\\/g, "/");
    out.push({ from: path, to: resolved, line: i + 1 });
  }
  return out;
}

function stripExt(p: string): string {
  return p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
}

function findGraphEntry(
  graph: Map<string, Set<string>>,
  current: string
): Set<string> | undefined {
  // Direct hit.
  if (graph.has(current)) return graph.get(current);
  // Try with each common extension.
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    if (graph.has(current + ext)) return graph.get(current + ext);
  }
  // Substring fallback (e.g. resolved is /tmp/abs/src/b, key is src/b.ts).
  for (const [key, deps] of graph.entries()) {
    if (stripExt(key) === stripExt(current)) return deps;
    if (stripExt(key).endsWith(stripExt(current))) return deps;
    if (stripExt(current).endsWith(stripExt(key))) return deps;
  }
  return undefined;
}

function depMatches(dep: string, target: string): boolean {
  const a = stripExt(dep);
  const b = stripExt(target);
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function hasCycleBack(
  current: string,
  target: string,
  graph: Map<string, Set<string>>,
  visited: Set<string>
): boolean {
  if (visited.has(current)) return false;
  visited.add(current);
  const out = findGraphEntry(graph, current);
  if (!out) return false;
  for (const dep of out) {
    if (depMatches(dep, target)) return true;
    if (hasCycleBack(dep, target, graph, visited)) return true;
  }
  return false;
}
