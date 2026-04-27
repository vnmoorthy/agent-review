// String/comment-aware brace matching. Used by detectors that need to find
// the closing `}` of a block without being fooled by template literals
// (`${...}`), string contents, or comments.

export function findBraceEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let started = false;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i] ?? "";
    inLineComment = false;
    for (let c = 0; c < l.length; c++) {
      const ch = l[c];
      const next = l[c + 1];
      const prev = c > 0 ? l[c - 1] : "";

      if (inLineComment) break;
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          c++;
        }
        continue;
      }
      if (inSingle) {
        if (ch === "\\") c++;
        else if (ch === "'") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (ch === "\\") c++;
        else if (ch === '"') inDouble = false;
        continue;
      }
      if (inBacktick) {
        if (ch === "\\") {
          c++;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
          continue;
        }
        if (ch === "$" && next === "{") {
          // Walk the template-literal expression as balanced braces.
          let edepth = 1;
          c += 2;
          while (c < l.length && edepth > 0) {
            const ec = l[c];
            if (ec === "{") edepth++;
            else if (ec === "}") edepth--;
            else if (ec === "\\") c++;
            if (edepth > 0) c++;
          }
        }
        continue;
      }
      if (ch === "/" && next === "/") {
        inLineComment = true;
        break;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        c++;
        continue;
      }
      if (ch === "'" && prev !== "\\") {
        inSingle = true;
        continue;
      }
      if (ch === '"' && prev !== "\\") {
        inDouble = true;
        continue;
      }
      if (ch === "`" && prev !== "\\") {
        inBacktick = true;
        continue;
      }

      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth <= 0) return i;
      }
    }
  }
  return Math.min(lines.length - 1, startIdx + 60);
}

export function findPyBlockEnd(lines: string[], startIdx: number): number {
  const startLine = lines[startIdx] ?? "";
  const startIndent = startLine.length - startLine.trimStart().length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.trim() === "") continue;
    const indent = l.length - l.trimStart().length;
    if (indent <= startIndent) return i;
  }
  return Math.min(lines.length - 1, startIdx + 80);
}
