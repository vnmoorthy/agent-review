// Tests for the diff parser.

import { describe, it, expect } from "vitest";
import { parseRawDiff } from "../src/core/git/diff.js";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 import { x } from "y"
+import { z } from "y"

 function a() { return 1 }
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,2 @@
+export function bar() { return 2 }
+
diff --git a/src/old.ts b/src/new.ts
similarity index 95%
rename from src/old.ts
rename to src/new.ts
index 4444444..5555555 100644
--- a/src/old.ts
+++ b/src/new.ts
@@ -10,3 +10,3 @@
 function r() {
-  return 1
+  return 2
 }
`;

describe("parseRawDiff", () => {
  it("parses a multi-file unified diff", () => {
    const parsed = parseRawDiff(SAMPLE);
    expect(parsed.files).toHaveLength(3);
    const [foo, bar, renamed] = parsed.files;
    expect(foo?.path).toBe("src/foo.ts");
    expect(foo?.status).toBe("modified");
    expect(foo?.addedLines.has(2)).toBe(true);

    expect(bar?.path).toBe("src/bar.ts");
    expect(bar?.status).toBe("added");
    expect(bar?.addedLines.size).toBeGreaterThan(0);

    expect(renamed?.path).toBe("src/new.ts");
    expect(renamed?.oldPath).toBe("src/old.ts");
    expect(renamed?.status).toBe("renamed");
  });
});
