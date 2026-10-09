import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { demoProject } from "@/domain/projects/demo-project";
import { PROJECT_SCHEMA_VERSION } from "@/domain/projects/schema";
import { MockPlannerProvider } from "@/server/planner/model-provider";
import { PlannerOutlineService } from "@/server/planner/planner-service";
import {
  createDependencyFixtureProject,
  DEPENDENCY_CHAPTER_ID,
  DEPENDENT_SECTION_ID,
  PREDECESSOR_SECTION_ID,
} from "@/server/dependencies/test-fixture";
import { createNodeProjectFileSystem } from "./file-system";
import { ProjectRepository, ProjectRepositoryError } from "./project-repository";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "planning-ai-workbench-"));
  temporaryRoots.push(root);
  return { root, repository: new ProjectRepository({ dataRoot: root }) };
}

async function writeProject(root: string, fileName: string, project: unknown) {
  const itemsDirectory = path.join(root, "items");
  await writeFile(path.join(itemsDirectory, fileName), JSON.stringify(project), "utf8");
}

function plannerOutput() {
  return {
    contractVersion: 1,
    outlineTitle: "测试方案结构",
    chapters: [{
      nodeId: "project_overview", title: "项目概况", purpose: "说明项目背景",
      keyPoints: ["项目背景"],
      requiredMaterials: [{ name: "项目背景资料", sourceMaterialIds: ["mat_project_context"], reason: "说明项目基础" }],
      prerequisiteNodeIds: [], prerequisiteNotes: [], estimatedLengthChars: 1000,
      generationBasis: [{ materialId: "mat_project_context", reason: "提供项目背景" }],
      sections: [{
        nodeId: "project_scope", title: "任务范围", purpose: "说明任务范围", keyPoints: ["任务要求"],
        writerType: "strategy_solution",
        requiredMaterials: [{ name: "任务要求", sourceMaterialIds: ["mat_task_brief"], reason: "明确范围" }],
        prerequisiteNodeIds: ["project_overview"], prerequisiteNotes: ["基于项目概况"], estimatedLengthChars: 800,
        generationBasis: [{ materialId: "mat_task_brief", reason: "提供任务要求" }],
      }],
    }],
    missingMaterials: [], professionalConfirmations: [],
  };
}

async function createSuggestion(repository: ProjectRepository) {
  return new PlannerOutlineService(repository, new MockPlannerProvider(() => ({
    rawText: JSON.stringify(plannerOutput()), providerResponseId: "response_1", resolvedModel: "mock-model",
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  })), "mock-model").generateLatestSuggestion("a-village");
}

function writerSuggestion(sectionTitle: string, generationId: string) {
  return {
    generationId,
    generationRequestId: `req_${generationId}`,
    provider: "mock",
    requestedModel: "mock-model",
    resolvedModel: "mock-model",
    providerResponseId: null,
    promptVersion: "writer-test",
    promptSource: "test",
    parentPromptVersion: "test",
    contentHash: "a".repeat(64),
    contractVersion: 1 as const,
    inputFingerprint: "b".repeat(64),
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    latencyMs: 1,
    attemptCount: 1,
    startedAt: "2026-07-30T00:00:00.000Z",
    completedAt: "2026-07-30T00:00:01.000Z",
    generatedAt: "2026-07-30T00:00:01.000Z",
    content: {
      chapterNodeId: "project_overview",
      sectionNodeId: "project_scope",
      sectionTitle,
      contentMarkdown: `AI suggestion ${generationId}`,
      strategyMapping: [{ problem: "problem", evidence: ["evidence"], strategy: "strategy", measures: ["measure"] }],
      sourceUsed: ["mat_project_context"],
      missingInfo: [],
      humanConfirmation: [],
      sectionSummary: "Current section summary.",
    },
  };
}

describe("ProjectRepository", () => {
  it("creates the a-village seed with mock materials once and does not overwrite existing project data", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    const seedPath = path.join(root, "items", "a-village.json");
    expect(JSON.parse(await readFile(seedPath, "utf8"))).toMatchObject({
      projectId: "a-village",
      schemaVersion: PROJECT_SCHEMA_VERSION,
      materials: expect.arrayContaining([expect.objectContaining({ materialId: "mat_project_context" })]),
    });
    await writeProject(root, "a-village.json", { ...demoProject, name: "已修改的演示项目" });
    await repository.initialize();
    expect(JSON.parse(await readFile(seedPath, "utf8"))).toMatchObject({ name: "已修改的演示项目" });
  });

  it("migrates a v1 project safely and gives ordinary projects no demo materials", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    const legacyProject = {
      schemaVersion: 1,
      projectId: "ordinary-project",
      name: "普通项目",
      projectType: "专项规划",
      createdAt: "2026-07-28T08:00:00.000Z",
      updatedAt: "2026-07-28T08:00:00.000Z",
    };
    await writeProject(root, "ordinary-project.json", legacyProject);
    await expect(repository.getById("ordinary-project")).resolves.toMatchObject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      materials: [],
    });
    expect(JSON.parse(await readFile(path.join(root, "items", "ordinary-project.json"), "utf8"))).toMatchObject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      materials: [],
    });
  });

  it("scans valid JSON files, sorts them and isolates invalid JSON", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    await writeProject(root, "newer-project.json", { ...demoProject, projectId: "newer-project", name: "较新的项目", updatedAt: "2026-07-29T08:00:00.000Z" });
    await writeFile(path.join(root, "items", "broken.json"), "{invalid", "utf8");
    const result = await repository.list();
    expect(result.projects.map((project) => project.projectId)).toEqual(["newer-project", "a-village"]);
    expect(result.issues).toEqual([{ fileName: "broken.json", code: "PROJECT_READ_FAILED" }]);
  });

  it("returns the requested project and distinguishes invalid and missing identifiers", async () => {
    const { repository } = await createRepository();
    await expect(repository.getById("a-village")).resolves.toMatchObject({ projectId: "a-village" });
    await expect(repository.getById("../outside")).rejects.toMatchObject({ code: "PROJECT_ID_INVALID" } satisfies Partial<ProjectRepositoryError>);
    await expect(repository.getById("missing-project")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" } satisfies Partial<ProjectRepositoryError>);
  });

  it("creates a stable project document and updates only its editable fields", async () => {
    const { root, repository } = await createRepository();
    const created = await repository.create({ name: "  新建项目  ", projectType: "  专项规划  " });
    const updated = await repository.update(created.projectId, { name: "更新后的项目", projectType: "更新类型" });
    expect(created.projectId).toMatch(/^prj_[0-9a-f-]{36}$/);
    expect(updated).toMatchObject({
      projectId: created.projectId,
      createdAt: created.createdAt,
      name: "更新后的项目",
      projectType: "更新类型",
      materials: [],
    });
    expect(JSON.parse(await readFile(path.join(root, "items", `${created.projectId}.json`), "utf8"))).toMatchObject(updated);
  });

  it("reads materials, persists usage changes and recalculates readiness", async () => {
    const { root, repository } = await createRepository();
    const before = await repository.getMaterials("a-village");
    expect(before.readiness.canGenerate).toBe(true);
    const result = await repository.updateMaterialUsage("a-village", "mat_project_context", {
      materialUsageStatus: "excluded",
    });
    expect(result.material).toMatchObject({
      materialId: "mat_project_context",
      materialUsageStatus: "excluded",
    });
    expect(result.readiness.canGenerate).toBe(false);
    expect(result.readiness.blockingMissing.map((item) => item.category)).toEqual(["project_context"]);
    expect(JSON.parse(await readFile(path.join(root, "items", "a-village.json"), "utf8"))).toMatchObject({
      materials: expect.arrayContaining([
        expect.objectContaining({
          materialId: "mat_project_context",
          materialUsageStatus: "excluded",
        }),
      ]),
    });
  });

  it("rejects unknown materials and attempts to edit other status fields", async () => {
    const { repository } = await createRepository();
    await expect(repository.updateMaterialUsage("a-village", "mat_missing", {
      materialUsageStatus: "adopted",
    })).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(repository.updateMaterialUsage("a-village", "mat_project_context", {
      materialUsageStatus: "adopted",
      materialParseStatus: "failed",
    })).rejects.toMatchObject({ code: "MATERIAL_VALIDATION_FAILED" });
  });

  it("keeps the original project readable when safe replacement fails", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    const nodeFileSystem = createNodeProjectFileSystem();
    const failingRepository = new ProjectRepository({
      dataRoot: root,
      fileSystem: { ...nodeFileSystem, replaceFile: async () => { throw new Error("replace failed"); } },
    });
    await expect(failingRepository.update("a-village", { name: "不会保存", projectType: "测试类型" })).rejects.toMatchObject({ code: "PROJECT_WRITE_FAILED" });
    await expect(repository.getById("a-village")).resolves.toMatchObject({ name: demoProject.name, projectType: demoProject.projectType });
  });

  it("applies an AI suggestion explicitly, saves a revised working outline, and preserves the AI original", async () => {
    const { root, repository } = await createRepository();
    const suggestion = await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    expect(applied.workingOutline).toMatchObject({ revision: 1, basedOnGenerationId: suggestion.generationId, content: suggestion.content });
    const edited = structuredClone(applied.workingOutline!.content);
    edited.chapters[0].title = "人工调整后的项目概况";
    const saved = await repository.saveWorkingOutline("a-village", { expectedRevision: 1, content: edited });
    expect(saved.workingOutline).toMatchObject({ revision: 2, content: { chapters: [expect.objectContaining({ title: "人工调整后的项目概况" })] } });
    expect(saved.latestSuggestion).toEqual(suggestion);
    await expect(repository.saveWorkingOutline("a-village", { expectedRevision: 1, content: edited })).rejects.toMatchObject({ code: "OUTLINE_CONFIRM_CONFLICT" });
    const emptyOutline = structuredClone(saved.workingOutline!.content);
    emptyOutline.chapters = [];
    await expect(repository.saveWorkingOutline("a-village", { expectedRevision: 2, content: emptyOutline })).rejects.toMatchObject({ code: "OUTLINE_VALIDATION_FAILED" });
    const emptyChapter = structuredClone(saved.workingOutline!.content);
    emptyChapter.chapters[0].sections = [];
    await expect(repository.saveWorkingOutline("a-village", { expectedRevision: 2, content: emptyChapter })).rejects.toMatchObject({ code: "OUTLINE_VALIDATION_FAILED" });
    await expect(new ProjectRepository({ dataRoot: root }).getById("a-village")).resolves.toMatchObject({
      plannerOutline: { workingOutline: { revision: 2, content: { chapters: [expect.objectContaining({ title: "人工调整后的项目概况" })] } } },
    });
  });

  it("creates immutable confirmed versions and later suggestions never overwrite working or confirmed state", async () => {
    const { repository } = await createRepository();
    const firstSuggestion = await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    const firstConfirmation = await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    expect(firstConfirmation.activeConfirmedVersion).toBe(1);
    expect(firstConfirmation.confirmedVersions).toHaveLength(1);
    const changed = structuredClone(firstConfirmation.workingOutline!.content);
    changed.chapters[0].keyPoints = ["人工补充重点"];
    const saved = await repository.saveWorkingOutline("a-village", { expectedRevision: 1, content: changed });
    const secondConfirmation = await repository.confirmWorkingOutline("a-village", { expectedRevision: saved.workingOutline!.revision });
    expect(secondConfirmation.activeConfirmedVersion).toBe(2);
    expect(secondConfirmation.confirmedVersions[0].content).toEqual(firstSuggestion.content);
    const newerSuggestion = { ...firstSuggestion, generationId: "generation_new", generatedAt: "2026-07-29T10:00:00.000Z", completedAt: "2026-07-29T10:00:00.000Z", startedAt: "2026-07-29T09:59:00.000Z" };
    await repository.saveLatestSuggestion("a-village", newerSuggestion);
    const protectedState = await repository.getById("a-village");
    expect(protectedState.plannerOutline.workingOutline).toEqual(secondConfirmation.workingOutline);
    expect(protectedState.plannerOutline.confirmedVersions).toEqual(secondConfirmation.confirmedVersions);
  });

  it("reports outline write failures without changing the latest suggestion or existing project file", async () => {
    const { root, repository } = await createRepository();
    const suggestion = await createSuggestion(repository);
    const nodeFileSystem = createNodeProjectFileSystem();
    const failingRepository = new ProjectRepository({
      dataRoot: root,
      fileSystem: { ...nodeFileSystem, replaceFile: async () => { throw new Error("replace failed"); } },
    });
    await expect(failingRepository.applyLatestSuggestion("a-village")).rejects.toMatchObject({ code: "OUTLINE_WRITE_FAILED" });
    await expect(repository.getById("a-village")).resolves.toMatchObject({
      plannerOutline: { latestSuggestion: suggestion, workingOutline: null, confirmedVersions: [] },
    });
  });

  it("does not pollute a saved working outline or confirmed versions when their writes fail", async () => {
    const { root, repository } = await createRepository();
    await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    const beforeFailure = await repository.getById("a-village");
    const nodeFileSystem = createNodeProjectFileSystem();
    const failingRepository = new ProjectRepository({
      dataRoot: root,
      fileSystem: { ...nodeFileSystem, replaceFile: async () => { throw new Error("replace failed"); } },
    });
    const edited = structuredClone(applied.workingOutline!.content);
    edited.chapters[0].title = "不应写入的修改";
    await expect(failingRepository.saveWorkingOutline("a-village", { expectedRevision: 1, content: edited })).rejects.toMatchObject({ code: "OUTLINE_WRITE_FAILED" });
    await expect(failingRepository.confirmWorkingOutline("a-village", { expectedRevision: 1 })).rejects.toMatchObject({ code: "OUTLINE_WRITE_FAILED" });
    await expect(repository.getById("a-village")).resolves.toEqual(beforeFailure);
  });

  it("saves a section draft against the active confirmed version and appends immutable snapshots", async () => {
    const { root, repository } = await createRepository();
    await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    const first = await repository.saveSectionDraft("a-village", "project_overview", "project_scope", { expectedRevision: 0, contentMarkdown: "人工草稿 v1" });
    expect(first).toMatchObject({ target: { confirmedOutlineVersion: 1, chapterId: "project_overview", sectionId: "project_scope" }, latestSuggestion: null, workingDraft: { revision: 1, contentMarkdown: "人工草稿 v1" }, versions: [] });
    const snapshot = await repository.createSectionDraftVersion("a-village", "project_overview", "project_scope", { expectedRevision: 1 });
    expect(snapshot.versions).toHaveLength(1);
    const second = await repository.saveSectionDraft("a-village", "project_overview", "project_scope", { expectedRevision: 1, contentMarkdown: "人工草稿 v2" });
    expect(second.versions[0].contentMarkdown).toBe("人工草稿 v1");
    await expect(new ProjectRepository({ dataRoot: root }).getSectionDraft("a-village", "project_overview", "project_scope")).resolves.toMatchObject({ draft: { workingDraft: { contentMarkdown: "人工草稿 v2" }, versions: [{ contentMarkdown: "人工草稿 v1" }] } });
  });

  it("applies the first writer suggestion at revision zero and creates an immutable AI snapshot", async () => {
    const { repository } = await createRepository();
    await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    const target = await repository.getSectionDraft("a-village", "project_overview", "project_scope");
    await repository.saveSectionSuggestion("a-village", "project_overview", "project_scope", {
      generationId: "wrt_first", generationRequestId: "req_first", provider: "mock", requestedModel: "mock-model", resolvedModel: "mock-model", providerResponseId: null,
      promptVersion: "writer-test", promptSource: "test", parentPromptVersion: "test", contentHash: "a".repeat(64), contractVersion: 1,
      inputFingerprint: "b".repeat(64), tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1, attemptCount: 1,
      startedAt: "2026-07-30T00:00:00.000Z", completedAt: "2026-07-30T00:00:01.000Z", generatedAt: "2026-07-30T00:00:01.000Z",
      content: { chapterNodeId: "project_overview", sectionNodeId: "project_scope", sectionTitle: target.target.sectionTitle, contentMarkdown: "AI 建议正文", strategyMapping: [{ problem: "问题", evidence: ["资料"], strategy: "策略", measures: ["措施"] }], sourceUsed: ["mat_project_context"], missingInfo: [], humanConfirmation: [], sectionSummary: "当前子节摘要" },
    });
    const draft = await repository.applySectionSuggestion("a-village", "project_overview", "project_scope", { expectedRevision: 0 });
    expect(draft.workingDraft).toMatchObject({ revision: 1, contentMarkdown: "AI 建议正文", basedOnGenerationId: "wrt_first" });
    expect(draft.versions).toMatchObject([{ version: 1, source: "ai_applied", generationId: "wrt_first" }]);
  });

  it("keeps the manual draft and immutable history when Writer regenerates a newer suggestion", async () => {
    const { repository } = await createRepository();
    await createSuggestion(repository);
    const applied = await repository.applyLatestSuggestion("a-village");
    await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    const target = await repository.getSectionDraft("a-village", "project_overview", "project_scope");
    const saved = await repository.saveSectionDraft("a-village", "project_overview", "project_scope", { expectedRevision: 0, contentMarkdown: "Manual draft" });
    const snapshotted = await repository.createSectionDraftVersion("a-village", "project_overview", "project_scope", { expectedRevision: saved.workingDraft!.revision });
    const manualDraft = structuredClone(snapshotted.workingDraft);
    const history = structuredClone(snapshotted.versions);

    await repository.saveSectionSuggestion("a-village", "project_overview", "project_scope", writerSuggestion(target.target.sectionTitle, "wrt_regenerated"));

    const current = await repository.getSectionDraft("a-village", "project_overview", "project_scope");
    expect(current.draft).toMatchObject({ latestSuggestion: { generationId: "wrt_regenerated" } });
    expect(current.draft?.workingDraft).toEqual(manualDraft);
    expect(current.draft?.versions).toEqual(history);
  });

  it("rejects targets outside the active confirmed outline and preserves drafts when writing fails", async () => {
    const { root, repository } = await createRepository();
    await expect(repository.saveSectionDraft("a-village", "missing", "missing", { expectedRevision: 0, contentMarkdown: "x" })).rejects.toMatchObject({ code: "SECTION_TARGET_NOT_FOUND" });
    await createSuggestion(repository); const applied = await repository.applyLatestSuggestion("a-village"); await repository.confirmWorkingOutline("a-village", { expectedRevision: applied.workingOutline!.revision });
    const saved = await repository.saveSectionDraft("a-village", "project_overview", "project_scope", { expectedRevision: 0, contentMarkdown: "安全内容" });
    const nodeFileSystem = createNodeProjectFileSystem();
    const failing = new ProjectRepository({ dataRoot: root, fileSystem: { ...nodeFileSystem, replaceFile: async () => { throw new Error("replace failed"); } } });
    await expect(failing.saveSectionDraft("a-village", "project_overview", "project_scope", { expectedRevision: saved.workingDraft!.revision, contentMarkdown: "不应写入" })).rejects.toMatchObject({ code: "SECTION_DRAFT_WRITE_FAILED" });
    await expect(repository.getSectionDraft("a-village", "project_overview", "project_scope")).resolves.toMatchObject({ draft: { workingDraft: { contentMarkdown: "安全内容" } } });
  });

  it("persists a stable section dependency and rejects a dependency cycle", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    await writeProject(root, "a-village.json", createDependencyFixtureProject({ confirmPredecessor: false }));
    const dependency = await repository.updateSectionDependency(
      "a-village",
      DEPENDENCY_CHAPTER_ID,
      DEPENDENT_SECTION_ID,
      { predecessorSectionId: PREDECESSOR_SECTION_ID, mode: "blocking" },
    );
    expect(dependency).toMatchObject({
      status: "waiting",
      mode: "blocking",
      source: "user",
      predecessor: { sectionId: PREDECESSOR_SECTION_ID },
    });
    await expect(repository.updateSectionDependency(
      "a-village",
      DEPENDENCY_CHAPTER_ID,
      PREDECESSOR_SECTION_ID,
      { predecessorSectionId: DEPENDENT_SECTION_ID, mode: "reference" },
    )).rejects.toMatchObject({ code: "SECTION_DEPENDENCY_INVALID" });
    await expect(repository.updateSectionDependency(
      "a-village",
      DEPENDENCY_CHAPTER_ID,
      DEPENDENT_SECTION_ID,
      { predecessorSectionId: null, mode: "none" },
    )).resolves.toMatchObject({ status: "none", mode: "none", source: "user" });
    expect(JSON.parse(await readFile(path.join(root, "items", "a-village.json"), "utf8"))).toMatchObject({
      sectionDependencies: {
        [DEPENDENT_SECTION_ID]: { predecessorSectionId: null, mode: "none" },
      },
    });
  });

  it("allows parallel drafting but blocks final confirmation while a reference dependency is provisional", async () => {
    const { root, repository } = await createRepository();
    await repository.initialize();
    await writeProject(root, "a-village.json", createDependencyFixtureProject({
      confirmPredecessor: false,
      includeDependentDraft: true,
    }));
    await expect(repository.getSectionDraft(
      "a-village",
      DEPENDENCY_CHAPTER_ID,
      DEPENDENT_SECTION_ID,
    )).resolves.toMatchObject({
      dependency: { status: "provisional", mode: "reference" },
      draft: { workingDraft: expect.any(Object) },
    });
    await expect(repository.confirmReviewedSection(
      "a-village",
      DEPENDENCY_CHAPTER_ID,
      DEPENDENT_SECTION_ID,
    )).rejects.toMatchObject({ code: "SECTION_DEPENDENCY_UNMET" });
  });
});
