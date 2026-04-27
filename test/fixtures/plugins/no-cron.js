// Sample custom detector used by the plugin tests.

exports.detector = {
  id: "CUSTOM_NO_CRON",
  category: "drive-by",
  title: "Cron module imported",
  applies: (ctx) => ctx.filePath.endsWith(".ts") || ctx.filePath.endsWith(".js"),
  run: (ctx) => {
    if (!ctx.newContent) return [];
    const out = [];
    ctx.newContent.split("\n").forEach((line, i) => {
      if (/from\s+['"]cron['"]/.test(line)) {
        out.push({
          detectorId: "CUSTOM_NO_CRON",
          category: "drive-by",
          title: "Cron module imported",
          file: ctx.filePath,
          line: i + 1,
          endLine: i + 1,
          severity: "medium",
          confidence: "high",
          message: "Use the platform scheduler instead of `cron`.",
        });
      }
    });
    return out;
  },
};
