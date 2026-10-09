import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { MockPlannerProvider } from "@/server/planner/model-provider";
import { PlannerOutlineService } from "@/server/planner/planner-service";
import { ProjectRepository } from "@/server/projects/project-repository";
import {
  createDeepSeekWriterProviderFromEnvironment,
  getConfiguredWriterModel,
} from "@/server/writer/model-provider";
import { WriterService } from "@/server/writer/writer-service";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planning-ai-writer-smoke-"));

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function createConfirmedStrategyTarget(repository: ProjectRepository) {
  const planner = new PlannerOutlineService(repository, new MockPlannerProvider(() => ({
    rawText: JSON.stringify({
      contractVersion: 1,
      outlineTitle: "Writer smoke outline",
      chapters: [{
        nodeId: "ch_strategy",
        title: "Strategy",
        purpose: "Provide a focused strategy section.",
        keyPoints: ["problem-goal-strategy-measure"],
        requiredMaterials: [{ name: "Project context", sourceMaterialIds: ["mat_project_context"], reason: "Project facts" }],
        prerequisiteNodeIds: [],
        prerequisiteNotes: [],
        estimatedLengthChars: 1200,
        generationBasis: [{ materialId: "mat_project_context", reason: "Project facts" }],
        sections: [{
          nodeId: "sec_strategy",
          title: "Development strategy",
          purpose: "Generate the current strategy subsection only.",
          writerType: "strategy_solution",
          keyPoints: ["problem-goal-strategy-measure"],
          requiredMaterials: [{ name: "Project context", sourceMaterialIds: ["mat_project_context"], reason: "Project facts" }],
          prerequisiteNodeIds: ["ch_strategy"],
          prerequisiteNotes: ["Use the confirmed project context."],
          estimatedLengthChars: 1000,
          generationBasis: [{ materialId: "mat_project_context", reason: "Project facts" }],
        }],
      }],
      missingMaterials: [],
      professionalConfirmations: [],
    }),
    providerResponseId: "mock-planner-response",
    resolvedModel: "mock-model",
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  })), "mock-model");
  await planner.generateLatestSuggestion("a-village");
  const applied = await repository.applyLatestSuggestion("a-village");
  await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
}

describe("DeepSeek Writer live smoke test", () => {
  it("generates a valid suggestion for an isolated confirmed strategy section without creating a draft or version", async () => {
    if (process.env.AI_PROVIDER !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
      throw new Error("Set AI_PROVIDER=deepseek and DEEPSEEK_API_KEY before running this live smoke test.");
    }
    const repository = new ProjectRepository({ dataRoot: temporaryRoot });
    await createConfirmedStrategyTarget(repository);
    const service = new WriterService(
      repository,
      createDeepSeekWriterProviderFromEnvironment(),
      getConfiguredWriterModel(),
    );

    const suggestion = await service.generateLatestSuggestion("a-village", "ch_strategy", "sec_strategy");
    const stored = await repository.getSectionDraft("a-village", "ch_strategy", "sec_strategy");

    expect(suggestion.provider).toBe("deepseek");
    expect(suggestion.content.sectionNodeId).toBe("sec_strategy");
    expect(suggestion.content.contentMarkdown.length).toBeGreaterThan(0);
    expect(suggestion.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.draft).toMatchObject({ latestSuggestion: { generationId: suggestion.generationId }, workingDraft: null, versions: [] });
  }, 130_000);
});
