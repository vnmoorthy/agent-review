// Zod schema for the structured response we expect from the model.

import { z } from "zod";

export const FindingSchema = z.object({
  detectorId: z.enum([
    "AR026",
    "AR027",
    "AR028",
    "AR029",
    "AR030",
    "AR031",
    "AR032",
    "AR033",
    "AR034",
    "AR035",
  ]),
  line: z.number().int().min(1),
  endLine: z.number().int().min(1).optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  message: z.string().min(1),
  rationale: z.string().optional(),
});

export const ReviewSchema = z.object({
  findings: z.array(FindingSchema),
});

export type LlmFinding = z.infer<typeof FindingSchema>;
