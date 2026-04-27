// Lazy AST loaders.
//
// Tree-sitter native modules are heavy and frequently fail to install on
// exotic platforms. We treat them as optional: if a language module loads,
// detectors that opted into AST mode get a real AST; if not, they fall back
// to a structural-text representation that's still useful for most checks.
//
// All loading is lazy so a Python-only repo doesn't pay the cost of loading
// the Go grammar.

import type { Lang } from "../git/files.js";
import { logger } from "../logger.js";

export interface AstNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
  children: AstNode[];
  parent?: AstNode;
}

export interface ParsedSource {
  lang: Lang;
  source: string;
  // The root node. `null` if parsing was unavailable.
  root: AstNode | null;
  // True if this came from tree-sitter (vs. our fallback).
  hasRealAst: boolean;
}

const treeSitterCache: Record<string, any> = {};
let parserLib: any = null;

function tryRequire(mod: string): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(mod);
  } catch {
    return null;
  }
}

function loadParserLib(): any | null {
  if (parserLib !== null) return parserLib;
  parserLib = tryRequire("tree-sitter") || false;
  if (!parserLib) {
    logger().debug("tree-sitter not available; using fallback parser");
  }
  return parserLib || null;
}

const LANG_PACKAGE: Record<Lang, string | null> = {
  ts: "tree-sitter-typescript",
  tsx: "tree-sitter-typescript",
  js: "tree-sitter-javascript",
  jsx: "tree-sitter-javascript",
  py: "tree-sitter-python",
  go: "tree-sitter-go",
  rust: "tree-sitter-rust",
  other: null,
};

function loadLanguage(lang: Lang): any | null {
  const pkg = LANG_PACKAGE[lang];
  if (!pkg) return null;
  if (treeSitterCache[lang]) return treeSitterCache[lang];

  const mod = tryRequire(pkg);
  if (!mod) {
    logger().debug(`tree-sitter language pack ${pkg} not installed`);
    return null;
  }

  let language = mod;
  if (lang === "ts") language = mod.typescript ?? mod;
  if (lang === "tsx") language = mod.tsx ?? mod.typescript ?? mod;
  treeSitterCache[lang] = language;
  return language;
}

function nodeToAstNode(n: any, source: string, parent?: AstNode): AstNode {
  const node: AstNode = {
    type: n.type,
    startPosition: { row: n.startPosition.row, column: n.startPosition.column },
    endPosition: { row: n.endPosition.row, column: n.endPosition.column },
    text: source.slice(n.startIndex, n.endIndex),
    children: [],
    parent,
  };
  for (const child of n.children) {
    node.children.push(nodeToAstNode(child, source, node));
  }
  return node;
}

export function parseSource(source: string, lang: Lang): ParsedSource {
  const Parser = loadParserLib();
  const language = lang === "other" ? null : loadLanguage(lang);

  if (Parser && language) {
    try {
      const parser = new Parser();
      parser.setLanguage(language);
      const tree = parser.parse(source);
      const root = nodeToAstNode(tree.rootNode, source);
      return { lang, source, root, hasRealAst: true };
    } catch (err) {
      logger().debug(`tree-sitter parse failed for ${lang}; falling back`, err);
    }
  }

  return { lang, source, root: buildFallbackAst(source, lang), hasRealAst: false };
}

// A very simple fallback "AST": top-level lines bucketed by recognized
// patterns (function, class, import, etc.). Detectors that lean on this only
// rely on coarse-grained signals.
function buildFallbackAst(source: string, lang: Lang): AstNode {
  const lines = source.split("\n");
  const root: AstNode = {
    type: "program",
    startPosition: { row: 0, column: 0 },
    endPosition: { row: lines.length - 1, column: 0 },
    text: source,
    children: [],
  };
  const isJsLike = lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx";
  const importRe = isJsLike
    ? /^\s*import\s+/
    : lang === "py"
      ? /^\s*(import|from)\s+/
      : lang === "go"
        ? /^\s*import\s*[("]/
        : lang === "rust"
          ? /^\s*use\s+/
          : /^a^/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (importRe.test(line)) {
      root.children.push({
        type: "import",
        startPosition: { row: i, column: 0 },
        endPosition: { row: i, column: line.length },
        text: line,
        children: [],
        parent: root,
      });
    }
  }
  return root;
}
