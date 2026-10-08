// Run from repository root: npx tsx test-data/anonymized/evaluate.ts predictions.json
// Reads saved outputs only. This command has no network adapter and never calls a paid model.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { categorySchema } from "@action-inbox/contracts";
import {
  extractionSchema,
  validateExtraction,
} from "../../services/api/src/pipeline/extractor.js";

const corpusSchema = z.object({
  version: z.literal("anonymized-v1"),
  normalizationVersion: z.literal("mime-text-v1"),
  cases: z
    .array(
      z.object({
        id: z.string(),
        normalizedBody: z.string(),
        label: z.object({
          category: categorySchema,
          actions: z.array(
            z.object({
              evidenceQuote: z.string(),
              dueAt: z.iso.datetime().nullable(),
              deadlineCertainty: z.enum(["Explicit", "Uncertain", "None"]),
              deadlineEvidenceQuote: z.string().nullable(),
            }),
          ),
        }),
      }),
    )
    .length(50),
});
const predictionsSchema = z.strictObject({
  datasetVersion: z.literal("anonymized-v1"),
  // Provenance is reported, not independently attested by this offline program.
  provenance: z.enum([
    "saved-model-output",
    "deterministic-test-output",
    "human-authored-output",
  ]),
  model: z.string().min(1),
  extractorVersion: z.string().min(1),
  outputs: z
    .array(z.strictObject({ id: z.string(), result: z.unknown() }))
    .length(50),
});
export async function evaluate(predictionsPath: string) {
  const corpus = corpusSchema.parse(
    JSON.parse(
      await readFile(
        fileURLToPath(new URL("./v1/cases.json", import.meta.url)),
        "utf8",
      ),
    ),
  );
  const predictions = predictionsSchema.parse(
    JSON.parse(await readFile(predictionsPath, "utf8")),
  );
  const byId = new Map(
    predictions.outputs.map((item) => [item.id, item.result]),
  );
  if (byId.size !== 50 || corpus.cases.some((item) => !byId.has(item.id)))
    throw new Error("Predictions must contain each corpus ID exactly once.");
  let categoryTP = 0,
    categoryFP = 0,
    categoryFN = 0;
  let actionTP = 0,
    actionFP = 0,
    actionFN = 0;
  let deadlineTP = 0,
    deadlineFP = 0,
    deadlineFN = 0;
  const misses: { id: string; reasons: string[] }[] = [];
  for (const item of corpus.cases) {
    const reasons: string[] = [];
    let result;
    try {
      result = validateExtraction(
        extractionSchema.parse(byId.get(item.id)),
        item.normalizedBody,
      );
    } catch {
      reasons.push("Invalid output or source evidence");
      if (item.label.category === "Action Required") categoryFN++;
      actionFN += item.label.actions.length;
      deadlineFN += item.label.actions.filter(
        (action) => action.dueAt !== null,
      ).length;
      misses.push({ id: item.id, reasons });
      continue;
    }
    const expectedRequired = item.label.category === "Action Required";
    const predictedRequired = result.category === "Action Required";
    if (expectedRequired && predictedRequired) categoryTP++;
    if (!expectedRequired && predictedRequired) {
      categoryFP++;
      reasons.push("False-positive actionable category");
    }
    if (expectedRequired && !predictedRequired) {
      categoryFN++;
      reasons.push("Missed actionable category");
    }
    const matched = new Set<number>();
    for (const action of result.actions) {
      const index = item.label.actions.findIndex(
        (expected, index) =>
          !matched.has(index) &&
          action.evidence.quote.includes(expected.evidenceQuote),
      );
      if (index < 0) {
        actionFP++;
        if (action.dueAt) deadlineFP++;
        reasons.push("Unsupported or unmatched action");
        continue;
      }
      matched.add(index);
      actionTP++;
      const expected = item.label.actions[index]!;
      if (action.dueAt && action.dueAt === expected.dueAt) deadlineTP++;
      else {
        if (action.dueAt) {
          deadlineFP++;
          reasons.push("Incorrect explicit deadline");
        }
        if (expected.dueAt) {
          deadlineFN++;
          reasons.push("Missed explicit deadline");
        }
      }
    }
    item.label.actions.forEach((action, index) => {
      if (!matched.has(index)) {
        actionFN++;
        if (action.dueAt) deadlineFN++;
        reasons.push("Missed action evidence");
      }
    });
    if (result.category !== item.label.category && reasons.length === 0)
      reasons.push("Incorrect non-action category");
    if (reasons.length) misses.push({ id: item.id, reasons });
  }
  const metrics = {
    actionRequired: {
      truePositive: categoryTP,
      falsePositive: categoryFP,
      falseNegative: categoryFN,
      precision:
        categoryTP + categoryFP ? categoryTP / (categoryTP + categoryFP) : null,
      recall:
        categoryTP + categoryFN ? categoryTP / (categoryTP + categoryFN) : null,
    },
    actions: {
      truePositive: actionTP,
      falsePositive: actionFP,
      falseNegative: actionFN,
      precision: actionTP + actionFP ? actionTP / (actionTP + actionFP) : null,
      recall: actionTP + actionFN ? actionTP / (actionTP + actionFN) : null,
    },
    explicitDeadline: {
      truePositive: deadlineTP,
      falsePositive: deadlineFP,
      falseNegative: deadlineFN,
      precision:
        deadlineTP + deadlineFP ? deadlineTP / (deadlineTP + deadlineFP) : null,
      recall:
        deadlineTP + deadlineFN ? deadlineTP / (deadlineTP + deadlineFN) : null,
    },
  };
  return {
    datasetVersion: corpus.version,
    sampleCount: corpus.cases.length,
    provenance: predictions.provenance,
    model: predictions.model,
    extractorVersion: predictions.extractorVersion,
    liveModelCallsPerformed: false,
    interpretation:
      "Metrics evaluate supplied saved outputs after production evidence/date validation. Null means no denominator, not perfect accuracy. Provenance is supplied by the caller; no live model accuracy is claimed.",
    matchingPolicy:
      "An action matches a unique labelled minimal source clause contained in its validated quote; deadlines must equal the labelled instant.",
    metrics,
    misses,
    thresholdsMet:
      metrics.actionRequired.recall !== null &&
      metrics.actionRequired.recall >= 0.9 &&
      metrics.explicitDeadline.precision !== null &&
      metrics.explicitDeadline.precision >= 0.9,
  };
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write(
      "Usage: npx tsx test-data/anonymized/evaluate.ts <saved-predictions.json>\nNo model is called. No accuracy report exists until predictions are supplied.\n",
    );
    process.exitCode = 1;
  } else {
    try {
      process.stdout.write(
        `${JSON.stringify(await evaluate(path), null, 2)}\n`,
      );
    } catch {
      process.stderr.write(
        "Evaluation input is invalid or unreadable. Supply all 50 version-matched saved outputs.\n",
      );
      process.exitCode = 1;
    }
  }
}
