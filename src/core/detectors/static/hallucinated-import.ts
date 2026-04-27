// AR005 — import in the diff that references a package not declared in any
// project manifest. We deliberately allow:
//   - Relative imports (./, ../).
//   - Path-mapped imports (@/, ~/) that look like project-internal aliases.
//   - Node built-ins.

import type { Detector, Finding } from "../types.js";
import { detectLang, isLanguageFile } from "../../git/files.js";
import { addedLineNumbers, isCommentLine, isDetectorSourceFile, makeFinding } from "../helpers.js";

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "url", "util", "events", "stream", "crypto", "child_process",
  "http", "https", "net", "zlib", "tls", "buffer", "process", "querystring",
  "string_decoder", "tty", "vm", "readline", "perf_hooks", "worker_threads",
  "assert", "async_hooks", "cluster", "console", "constants", "dgram",
  "dns", "domain", "module", "punycode", "repl", "timers", "v8", "test",
]);

const PY_STDLIB = new Set([
  "os", "sys", "json", "re", "math", "random", "time", "datetime", "collections",
  "itertools", "functools", "subprocess", "argparse", "pathlib", "shutil",
  "tempfile", "logging", "typing", "abc", "enum", "io", "csv", "hashlib",
  "uuid", "urllib", "http", "asyncio", "threading", "multiprocessing",
  "socket", "ssl", "sqlite3", "pickle", "copy", "warnings", "traceback",
  "string", "struct", "base64", "zlib", "gzip", "tarfile", "zipfile",
  "unittest", "doctest", "inspect", "weakref", "contextlib", "ast",
  "operator", "decimal", "fractions", "statistics", "concurrent",
]);

const GO_STDLIB_PREFIXES = [
  "fmt", "os", "io", "net", "log", "math", "strings", "strconv", "time",
  "context", "bytes", "encoding", "errors", "sort", "regexp", "sync",
  "path", "reflect", "runtime", "testing", "bufio", "crypto", "database",
  "compress", "container", "debug", "flag", "go", "hash", "html", "image",
  "index", "mime", "plugin", "text", "unicode",
];

const RUST_STDLIB = new Set(["std", "core", "alloc", "test"]);

function importsFromTsJs(line: string): string[] {
  const out: string[] = [];
  const m = line.match(/from\s+["']([^"']+)["']|require\(["']([^"']+)["']\)/);
  if (m) out.push(m[1] ?? m[2] ?? "");
  return out.filter(Boolean);
}

function packageRoot(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.slice(0, 2).join("/");
  }
  return spec.split("/")[0] ?? spec;
}

function isLocalSpec(spec: string): boolean {
  if (spec.startsWith(".") || spec.startsWith("/")) return true;
  if (spec.startsWith("@/") || spec.startsWith("~/") || spec.startsWith("#")) return true;
  return false;
}

export const detector: Detector = {
  id: "AR005",
  category: "hallucination",
  title: "Hallucinated package import",
  applies: (ctx) => isLanguageFile(ctx.filePath),
  run: (ctx) => {
    const lang = detectLang(ctx.filePath);
    if (!ctx.newContent) return [];
    const findings: Finding[] = [];
    const newLines = ctx.newContent.split("\n");
    const declared = ctx.project.declaredDependencies;

    if (isDetectorSourceFile(ctx.filePath)) return [];
    // Skip test files that often embed pretend import strings as fixtures.
    if (/(^|\/)(test|tests|__tests__)\//.test(ctx.filePath)) return [];
    if (/\.(test|spec)\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(ctx.filePath)) return [];
    for (const ln of addedLineNumbers(ctx)) {
      const text = newLines[ln - 1] ?? "";
      if (isCommentLine(text)) continue;
      // The line must look like a real import statement, not embed one in a string.
      const looksLikeImport =
        /^\s*import\b/.test(text) ||
        /^\s*from\s+["']/.test(text) ||
        /^\s*const\s+\S+\s*=\s*require\(/.test(text) ||
        /^\s*use\s+/.test(text) ||
        /^\s*"[a-zA-Z][^"]*"\s*$/.test(text); // bare Go-style import line
      if (!looksLikeImport) continue;
      if (lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx") {
        for (const spec of importsFromTsJs(text)) {
          if (isLocalSpec(spec)) continue;
          const root = packageRoot(spec);
          if (NODE_BUILTINS.has(root)) continue;
          if (root.startsWith("node:")) continue;
          if (declared.has(root)) continue;
          findings.push(buildFinding(ctx, ln, root, "package.json"));
        }
      } else if (lang === "py") {
        const m1 = text.match(/^\s*import\s+([A-Za-z_][\w.]*)/);
        const m2 = text.match(/^\s*from\s+([A-Za-z_][\w.]*)\s+import/);
        const mod = (m1?.[1] ?? m2?.[1] ?? "").split(".")[0] ?? "";
        if (!mod) continue;
        if (PY_STDLIB.has(mod)) continue;
        // Local relative imports start with `.`
        if (text.match(/^\s*from\s+\./)) continue;
        if (!declared.has(mod.toLowerCase())) {
          findings.push(buildFinding(ctx, ln, mod, "requirements"));
        }
      } else if (lang === "go") {
        const m = text.match(/^\s*"([^"]+)"\s*$/) || text.match(/^\s*import\s+"([^"]+)"/);
        const spec = m?.[1] ?? "";
        if (!spec) continue;
        if (GO_STDLIB_PREFIXES.some((p) => spec === p || spec.startsWith(p + "/"))) continue;
        let known = false;
        for (const dep of declared) if (spec === dep || spec.startsWith(dep + "/")) known = true;
        if (!known) findings.push(buildFinding(ctx, ln, spec, "go.mod"));
      } else if (lang === "rust") {
        const m = text.match(/^\s*use\s+([A-Za-z_][\w]*)(?:::|$|;)/);
        const root = m?.[1] ?? "";
        if (!root) continue;
        if (RUST_STDLIB.has(root)) continue;
        if (!declared.has(root) && root !== "crate" && root !== "self" && root !== "super") {
          findings.push(buildFinding(ctx, ln, root, "Cargo.toml"));
        }
      }
    }
    return findings;
  },
};

function buildFinding(ctx: any, line: number, name: string, manifest: string): Finding {
  return makeFinding("AR005", ctx, {
    line,
    endLine: line,
    message: `Imports \`${name}\` but the package is not declared in ${manifest}.`,
    confidence: "medium",
    suggestion: {
      kind: "text-only",
      text: `Add \`${name}\` to ${manifest}, or check that the import is real.`,
    },
  });
}
