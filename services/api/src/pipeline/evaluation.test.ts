import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluate } from "../../../../test-data/anonymized/evaluate.js";
import type { Extraction } from "./extractor.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
interface LabelledCase {
  id: string;
  label: {
    category: Extraction["category"];
    actions: {
      evidenceQuote: string;
      dueAt: string | null;
      deadlineCertainty: "Explicit" | "Uncertain" | "None";
      deadlineEvidenceQuote: string | null;
    }[];
  };
}
async function predictionsFile(
  outputs: { id: string; result: Extraction }[],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "action-evaluation-"));
  directories.push(directory);
  const path = join(directory, "predictions.json");
  await writeFile(
    path,
    JSON.stringify({
      datasetVersion: "anonymized-v1",
      provenance: "deterministic-test-output",
      model: "not-a-model",
      extractorVersion: "test-only",
      outputs,
    }),
  );
  return path;
}
async function labelledCases(): Promise<LabelledCase[]> {
  const corpus = JSON.parse(
    await readFile(
      new URL(
        "../../../../test-data/anonymized/v1/cases.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { cases: LabelledCase[] };
  return corpus.cases;
}
describe("offline evaluation arithmetic, not model accuracy", () => {
  it("computes true denominators for known synthetic outputs", async () => {
    const cases = await labelledCases();
    const outputs = cases.map((item) => ({
      id: item.id,
      result: {
        category: item.label.category,
        categoryConfidence: 1,
        actions: item.label.actions.map((action) => ({
          title: "Synthetic accounting test",
          evidenceQuote: action.evidenceQuote,
          dueAt: action.dueAt,
          deadlineQuote: action.deadlineEvidenceQuote,
          deadlineCertainty: action.deadlineCertainty,
          confidence: 1,
        })),
      },
    }));
    const report = await evaluate(await predictionsFile(outputs));
    expect(report.liveModelCallsPerformed).toBe(false);
    expect(report.provenance).toBe("deterministic-test-output");
    expect(report.metrics.actionRequired).toMatchObject({
      truePositive: 20,
      falseNegative: 0,
      recall: 1,
    });
    expect(report.metrics.explicitDeadline).toMatchObject({
      truePositive: 10,
      falsePositive: 0,
      precision: 1,
    });
  });
  it("reports misses and undefined precision instead of claiming perfect precision for zero predictions", async () => {
    const outputs = (await labelledCases()).map((item) => ({
      id: item.id,
      result: {
        category: "Reference" as const,
        categoryConfidence: 1,
        actions: [],
      },
    }));
    const report = await evaluate(await predictionsFile(outputs));
    expect(report.metrics.actionRequired.recall).toBe(0);
    expect(report.metrics.explicitDeadline.precision).toBeNull();
    expect(report.metrics.explicitDeadline.falseNegative).toBe(10);
    expect(report.thresholdsMet).toBe(false);
    expect(report.misses.length).toBeGreaterThanOrEqual(20);
  });
  it("rejects duplicate or missing case IDs", async () => {
    const outputs = Array.from({ length: 50 }, () => ({
      id: "case-01",
      result: {
        category: "Reference" as const,
        categoryConfidence: 1,
        actions: [],
      },
    }));
    await expect(evaluate(await predictionsFile(outputs))).rejects.toThrow(
      "each corpus ID exactly once",
    );
  });
});
