import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MockPlannerProvider,
  PlannerProviderError,
  type PlannerProviderResult,
} from "@/server/planner/model-provider";
import {
  PlannerGenerationError,
  PlannerOutlineService,
} from "@/server/planner/planner-service";
import {
  ProjectRepository,
  ProjectRepositoryError,
} from "@/server/projects/project-repository";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createRepository(): Promise<ProjectRepository> {
  const root = await mkdtemp(path.join(os.tmpdir(), "planning-ai-planner-"));
  temporaryRoots.push(root);
  return new ProjectRepository({ dataRoot: root });
}

function validOutput() {
  return {
    contractVersion: 1,
    outlineTitle: "A村规划技术方案结构",
    chapters: [{
      nodeId: "project_overview", title: "项目概况", purpose: "说明项目背景和成果要求",
      keyPoints: ["项目背景", "成果要求"],
      requiredMaterials: [{ name: "项目背景资料", sourceMaterialIds: ["mat_project_context"], reason: "用于说明项目基础" }],
      prerequisiteNodeIds: [], prerequisiteNotes: [], estimatedLengthChars: 1200,
      generationBasis: [{ materialId: "mat_project_context", reason: "提供项目背景" }],
      sections: [{
        nodeId: "project_scope", title: "任务范围", purpose: "明确编制任务范围",
        writerType: "fact_analysis",
        keyPoints: ["任务要求"],
        requiredMaterials: [{ name: "任务要求", sourceMaterialIds: ["mat_task_brief"], reason: "明确工作边界" }],
        prerequisiteNodeIds: ["project_overview"], prerequisiteNotes: ["基于项目概况展开"], estimatedLengthChars: 800,
        generationBasis: [{ materialId: "mat_task_brief", reason: "提供任务要求" }],
      }],
    }],
    missingMaterials: [], professionalConfirmations: [],
  };
}

function successResult(rawText = JSON.stringify(validOutput())): PlannerProviderResult {
  return {
    rawText, providerResponseId: "mock_response", resolvedModel: "mock-model",
    tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  };
}

describe("PlannerOutlineService", () => {
  it("uses MockPlannerProvider, saves only latestSuggestion, and records invocation metadata", async () => {
    const repository = await createRepository();
    const provider = new MockPlannerProvider(() => successResult());
    const service = new PlannerOutlineService(repository, provider, "mock-model");
    const suggestion = await service.generateLatestSuggestion("a-village");
    expect(provider.calls).toBe(1);
    expect(suggestion).toMatchObject({
      provider: "mock", requestedModel: "mock-model", resolvedModel: "mock-model",
      providerResponseId: "mock_response", promptVersion: "planner-outline-v1",
      inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, attemptCount: 1,
    });
    expect(suggestion.content.missingMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "missing_evaluation_criteria" }),
    ]));
    expect(suggestion.content.professionalConfirmations).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "professional_mat_evaluation" }),
    ]));
    const stored = await repository.getById("a-village");
    expect(stored.plannerOutline).toMatchObject({ latestSuggestion: suggestion, workingOutline: null, confirmedVersions: [], activeConfirmedVersion: null });
  });

  it("does not call a provider when required materials are insufficient", async () => {
    const repository = await createRepository();
    await repository.updateMaterialUsage("a-village", "mat_project_context", { materialUsageStatus: "excluded" });
    const provider = new MockPlannerProvider(() => successResult());
    const service = new PlannerOutlineService(repository, provider, "mock-model");
    await expect(service.generateLatestSuggestion("a-village")).rejects.toMatchObject({ code: "PLANNER_INPUT_INSUFFICIENT" } satisfies Partial<PlannerGenerationError>);
    expect(provider.calls).toBe(0);
  });

  it("retries one transient provider failure and never saves invalid output", async () => {
    const repository = await createRepository();
    let calls = 0;
    const provider = {
      provider: "mock",
      generate: async () => {
        calls += 1;
        if (calls === 1) throw new PlannerProviderError("PLANNER_PROVIDER_FAILED", true);
        return successResult();
      },
    };
    const service = new PlannerOutlineService(repository, provider, "mock-model");
    await expect(service.generateLatestSuggestion("a-village")).resolves.toMatchObject({ attemptCount: 2 });
    expect(calls).toBe(2);

    const invalidService = new PlannerOutlineService(repository, new MockPlannerProvider(() => successResult("{bad")), "mock-model");
    await expect(invalidService.generateLatestSuggestion("a-village")).rejects.toMatchObject({ code: "PLANNER_OUTPUT_INVALID" } satisfies Partial<PlannerGenerationError>);
    expect((await repository.getById("a-village")).plannerOutline.latestSuggestion).not.toBeNull();
  });

  it("rejects unknown material references and dependency cycles before persistence", async () => {
    const repository = await createRepository();
    const invalid = validOutput();
    invalid.chapters[0].sections[0].generationBasis[0].materialId = "not_from_input";
    const service = new PlannerOutlineService(repository, new MockPlannerProvider(() => successResult(JSON.stringify(invalid))), "mock-model");
    await expect(service.generateLatestSuggestion("a-village")).rejects.toMatchObject({ code: "PLANNER_OUTPUT_INVALID" } satisfies Partial<PlannerGenerationError>);
    expect((await repository.getById("a-village")).plannerOutline.latestSuggestion).toBeNull();
  });

  it("maps safe-write failures without replacing an existing suggestion", async () => {
    const repository = await createRepository();
    const previous = await new PlannerOutlineService(repository, new MockPlannerProvider(() => successResult()), "mock-model")
      .generateLatestSuggestion("a-village");
    const failingRepository = {
      getById: repository.getById.bind(repository),
      saveLatestSuggestion: async () => { throw new ProjectRepositoryError("PROJECT_WRITE_FAILED"); },
    };
    const service = new PlannerOutlineService(failingRepository, new MockPlannerProvider(() => successResult()), "mock-model");
    await expect(service.generateLatestSuggestion("a-village")).rejects.toMatchObject({ code: "PLANNER_SAVE_FAILED" } satisfies Partial<PlannerGenerationError>);
    expect((await repository.getById("a-village")).plannerOutline.latestSuggestion).toEqual(previous);
  });

  it("regenerates only the latest suggestion after a working outline has been confirmed", async () => {
    const repository = await createRepository();
    const service = new PlannerOutlineService(repository, new MockPlannerProvider(() => successResult()), "mock-model");
    const firstSuggestion = await service.generateLatestSuggestion("a-village");
    const applied = await repository.applyLatestSuggestion("a-village");
    const confirmed = await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    const secondSuggestion = await service.generateLatestSuggestion("a-village");
    const stored = await repository.getById("a-village");
    expect(secondSuggestion.generationId).not.toBe(firstSuggestion.generationId);
    expect(stored.plannerOutline.latestSuggestion).toEqual(secondSuggestion);
    expect(stored.plannerOutline.workingOutline).toEqual(confirmed.workingOutline);
    expect(stored.plannerOutline.confirmedVersions).toEqual(confirmed.confirmedVersions);
    expect(stored.plannerOutline.activeConfirmedVersion).toBe(1);
  });
});
