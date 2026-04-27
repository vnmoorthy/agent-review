// Generic AST visitor utilities.

import type { AstNode } from "./loaders.js";

export type Visitor = (node: AstNode) => void;
export type Predicate = (node: AstNode) => boolean;

export function walk(root: AstNode | null, visit: Visitor): void {
  if (!root) return;
  const stack: AstNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    visit(node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      const ch = node.children[i];
      if (ch) stack.push(ch);
    }
  }
}

export function find(root: AstNode | null, pred: Predicate): AstNode | null {
  if (!root) return null;
  let result: AstNode | null = null;
  walk(root, (n) => {
    if (!result && pred(n)) result = n;
  });
  return result;
}

export function findAll(root: AstNode | null, pred: Predicate): AstNode[] {
  const out: AstNode[] = [];
  walk(root, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
}

// True if any line in the inclusive range [start..end] (0-indexed) overlaps
// the changed lines (1-indexed).
export function nodeTouchesChangedLines(
  node: AstNode,
  changedLines: Set<number>
): boolean {
  for (let row = node.startPosition.row; row <= node.endPosition.row; row++) {
    if (changedLines.has(row + 1)) return true;
  }
  return false;
}

// Useful for detectors: returns the smallest enclosing function/class node
// for a given line, if any.
export function enclosingFunction(root: AstNode | null, lineZeroBased: number): AstNode | null {
  if (!root) return null;
  let best: AstNode | null = null;
  walk(root, (n) => {
    if (
      isFunctionLike(n) &&
      n.startPosition.row <= lineZeroBased &&
      n.endPosition.row >= lineZeroBased
    ) {
      if (!best || (n.endPosition.row - n.startPosition.row) <= (best.endPosition.row - best.startPosition.row)) {
        best = n;
      }
    }
  });
  return best;
}

const FUNCTION_TYPES = new Set([
  "function_declaration",
  "function_definition",
  "function",
  "method_definition",
  "arrow_function",
  "function_expression",
  "method_declaration",
  "function_signature",
]);

export function isFunctionLike(node: AstNode): boolean {
  return FUNCTION_TYPES.has(node.type);
}
