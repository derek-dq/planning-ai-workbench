import { demoProject } from "@/domain/projects/demo-project";
import type { ProjectDocument, SectionDraftDocument } from "@/domain/projects/schema";
import type { PlannerOutput } from "@/server/planner/contracts";
import type { WriterContent } from "@/server/writer/contracts";

export const REVIEWER_TEST_CHAPTER_ID = "ch_strategy";
export const REVIEWER_TEST_SECTION_ID = "sec_strategy";

export function reviewerTestOutline(): PlannerOutput {
  const nodeBase = {
    purpose: "形成当前子节的规划策略内容。",
    keyPoints: ["问题、目标、策略、措施", "事实必须可追溯"],
    requiredMaterials: [{
      name: "项目现状资料",
      sourceMaterialIds: ["mat_project_context"],
      reason: "用于核对项目事实。",
    }],
    prerequisiteNodeIds: [] as string[],
    prerequisiteNotes: [] as string[],
    estimatedLengthChars: 1200,
    generationBasis: [{ materialId: "mat_project_context", reason: "项目事实依据。" }],
  };
  return {
    contractVersion: 1,
    outlineTitle: "Reviewer 测试方案结构",
    chapters: [{
      ...nodeBase,
      nodeId: REVIEWER_TEST_CHAPTER_ID,
      title: "发展策略",
      sections: [{
        ...nodeBase,
        nodeId: REVIEWER_TEST_SECTION_ID,
        title: "产业发展策略",
        writerType: "strategy_solution",
      }],
    }],
    missingMaterials: [],
    professionalConfirmations: [],
  };
}

export function reviewerTestContent(contentMarkdown = "根据项目资料，当前常住人口为 9999 人，应大规模发展重工业。"): WriterContent {
  return {
    chapterNodeId: REVIEWER_TEST_CHAPTER_ID,
    sectionNodeId: REVIEWER_TEST_SECTION_ID,
    sectionTitle: "产业发展策略",
    contentMarkdown,
    strategyMapping: [{
      problem: "产业基础薄弱",
      evidence: ["mat_project_context"],
      strategy: "优化产业结构",
      measures: ["培育适宜产业"],
    }],
    sourceUsed: ["mat_project_context"],
    missingInfo: [],
    humanConfirmation: ["产业方向需专业确认"],
    sectionSummary: "提出产业发展策略。",
  };
}

export function createReviewerFixtureProject(contentMarkdown?: string): ProjectDocument {
  const project = structuredClone(demoProject);
  const outline = reviewerTestOutline();
  const content = reviewerTestContent(contentMarkdown);
  const now = "2026-07-30T08:00:00.000Z";
  const draft: SectionDraftDocument = {
    target: {
      confirmedOutlineVersion: 1,
      chapterId: REVIEWER_TEST_CHAPTER_ID,
      sectionId: REVIEWER_TEST_SECTION_ID,
      sectionTitle: "产业发展策略",
    },
    dependencySnapshot: null,
    latestSuggestion: null,
    workingDraft: {
      ...content,
      revision: 1,
      basedOnGenerationId: null,
      updatedAt: now,
    },
    versions: [],
  };
  project.updatedAt = now;
  project.materials = project.materials.map((material) => material.materialId === "mat_project_context"
    ? { ...material, summary: "项目已确认当前常住人口为 1200 人，产业以现代农业和乡村服务业为主。" }
    : material);
  project.plannerOutline = {
    outlineSchemaVersion: 1,
    latestSuggestion: null,
    workingOutline: null,
    confirmedVersions: [{
      version: 1,
      basedOnWorkingRevision: 1,
      basedOnGenerationId: null,
      confirmedAt: now,
      content: outline,
    }],
    activeConfirmedVersion: 1,
  };
  project.sectionDrafts = { [REVIEWER_TEST_SECTION_ID]: draft };
  project.sectionReviews = {};
  return project;
}
