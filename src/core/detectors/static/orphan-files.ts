// AR016 — new file added in this diff that no other file in the repo imports.

import type { Detector } from "../types.js";
import { isLanguageFile } from "../../git/files.js";
import { makeFinding } from "../helpers.js";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

export const detector: Detector = {
  id: "AR016",
  category: "dead-code",
  title: "Orphaned new file",
  applies: (ctx) =>
    isLanguageFile(ctx.filePath) &&
    ctx.fileDiff.status === "added",
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const stem = basename(ctx.filePath).replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/, "");
    if (
      stem === "index" ||
      stem === "main" ||
      stem === "__init__" ||
      stem === "lib" ||
      stem === "mod"
    ) {
      return [];
    }

    // Skip test files (orphan-ness doesn't apply: the test runner discovers them).
    if (/\.(test|spec)\./.test(ctx.filePath) || ctx.filePath.includes("/test/")) {
      return [];
    }
    // Skip configuration / scripts.
    if (/(^|\/)(config|settings|scripts)\//.test(ctx.filePath)) return [];
    // Skip files commonly auto-discovered by tooling.
    if (/\.config\.(ts|js|mjs|cjs)$/.test(ctx.filePath)) return [];
    if (/\.(eslintrc|prettierrc|babelrc|stylelintrc).*$/.test(ctx.filePath)) return [];
    // Skip generated/temp bundles.
    if (/bundled_[a-z0-9]+\.mjs$/.test(ctx.filePath)) return [];

    let referenced = false;
    for (const f of ctx.diff.files) {
      if (f.path === ctx.filePath) continue;
      if (!f.newContent) continue;
      if (referencesPath(f.newContent, ctx.filePath, stem)) {
        referenced = true;
        break;
      }
    }
    if (referenced) return [];

    // Cheap repo-wide grep using the project's importedPaths cache.
    for (const path of ctx.project.importedPaths) {
      if (resolve(ctx.repoRoot, ctx.filePath) === path) continue;
      try {
        const stats = statSync(path);
        if (!stats.isFile()) continue;
        const content = readFileSync(path, "utf8");
        if (referencesPath(content, ctx.filePath, stem)) {
          referenced = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (referenced) return [];

    return [
      makeFinding("AR016", ctx, {
        line: 1,
        endLine: 1,
        message: `New file appears to be unreferenced anywhere in the repo.`,
        confidence: "medium",
        suggestion: {
          kind: "text-only",
          text: `Either import this file from somewhere it's used, or remove it.`,
        },
      }),
    ];
  },
};

function referencesPath(content: string, path: string, stem: string): boolean {
  const re = new RegExp(`['"\`]([^'"\`]*?${escape(stem)})(?:\\.[a-z]+)?['"\`]`);
  return re.test(content);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
