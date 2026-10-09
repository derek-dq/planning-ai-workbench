import { demoProject } from "@/domain/projects/demo-project";
import type {
  ProjectDocument,
  SectionDependencySnapshot,
  SectionDraftDocument,
} from "@/domain/projects/schema";
import type { PlannerOutput } from "@/server/planner/contracts";
import {
  createDraftFingerprint,
  REVIEW_DIMENSIONS,
  type SectionReviewDocument,
} from "@/server/reviewer/contracts";
import type { WriterContent } from "@/server/writer/contracts";

export const DEPENDENCY_CHAPTER_ID = "ch_overview";
export const PREDECESSOR_SECTION_ID = "sec_background";
export const DEPENDENT_SECTION_ID = "sec_scope";
export const PREDECESSOR_BODY_SENTINEL = "FULL_PREDECESSOR_BODY_MUST_NOT_ENTER_WRITER_CONTEXT";

const confirmedAt = "2026-07-30T09:00:00.000Z";

function outline(): PlannerOutput {
  const nodeBase = {
    keyPoints: ["项目事实必须前后一致"],
    requiredMaterials: [{
      name: "项目任务书",
      sourceMaterialIds: ["mat_task_brief"],
      reason: "明确项目任务。",
    }],
    prerequisiteNotes: [] as string[],
    estimatedLengthChars: 800,
    generationBasis: [{ materialId: "mat_task_brief", reason: "项目任务依据。" }],
  };
  return {
    contractVersion: 1,
    outlineTitle: "依赖子节测试目录",
    chapters: [{
      ...nodeBase,
      nodeId: DEPENDENCY_CHAPTER_ID,
      title: "项目背景与任务概述",
      purpose: "说明项目背景与任务。",
      prerequisiteNodeIds: [],
      sections: [{
        ...nodeBase,
        nodeId: PREDECESSOR_SECTION_ID,
        title: "项目背景",
        purpose: "说明项目背景。",
        writerType: "strategy_solution",
        prerequisiteNodeIds: [],
      }, {
        ...nodeBase,
        nodeId: DEPENDENT_SECTION_ID,
        title: "规划范围与期限",
        purpose: "基于已确认背景明确规划范围。",
        writerType: "strategy_solution",
        prerequisiteNodeIds: [PREDECESSOR_SECTION_ID],
      }],
    }],
    missingMaterials: [],
    professionalConfirmations: [],
  };
}

function content(sectionId: string, title: string, body: string, summary: string): WriterContent {
  return {
    chapterNodeId: DEPENDENCY_CHAPTER_ID,
    sectionNodeId: sectionId,
    sectionTitle: title,
    contentMarkdown: body,
    strategyMapping: [{
      problem: "规划边界需要统一",
      evidence: ["mat_task_brief"],
      strategy: "以已确认项目边界为准",
      measures: ["统一项目名称和规划期限"],
    }],
    sourceUsed: ["mat_task_brief"],
    missingInfo: [],
    humanConfirmation: [],
    sectionSummary: summary,
  };
}

function reviewDocument(
  draft: NonNullable<SectionDraftDocument["workingDraft"]>,
  target: SectionReviewDocument["target"],
  fingerprint: string,
): SectionReviewDocument {
  return {
    target,
    runs: [{
      reviewId: `rev_${target.sectionId}`,
      projectId: "a-village",
      chapterId: target.chapterId,
      sectionId: target.sectionId,
      sourceDraftRevision: draft.revision,
      sourceFingerprint: fingerprint,
      reviewResult: "pass",
      dimensionResults: REVIEW_DIMENSIONS.map((dimension) => ({
        dimension,
        status: "pass",
        summary: "已通过。",
      })),
      issues: [],
      reviewSummary: "当前子节已通过校核。",
      callMetadata: {
        provider: "mock",
        requestedModel: "mock",
        resolvedModel: "mock",
        providerResponseId: null,
        promptVersion: "reviewer-test",
        inputFingerprint: "a".repeat(64),
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        attemptCount: 1,
        startedAt: confirmedAt,
        completedAt: confirmedAt,
      },
      createdAt: confirmedAt,
    }],
    issueStates: {},
    revisionSuggestions: {},
    professionalTasks: [],
    confirmations: [{
      confirmationId: `cnf_${target.sectionId}`,
      reviewId: `rev_${target.sectionId}`,
      draftRevision: draft.revision,
      sourceFingerprint: fingerprint,
      version: 1,
      confirmedAt,
    }],
  };
}

export function createDependencyFixtureProject(options: {
  confirmPredecessor?: boolean;
  includeDependentDraft?: boolean;
  confirmDependent?: boolean;
} = {}): ProjectDocument {
  const {
    confirmPredecessor = true,
    includeDependentDraft = false,
    confirmDependent = false,
  } = options;
  const project = structuredClone(demoProject);
  const confirmedOutline = outline();
  project.plannerOutline = {
    outlineSchemaVersion: 1,
    latestSuggestion: null,
    workingOutline: null,
    confirmedVersions: [{
      version: 1,
      basedOnWorkingRevision: 1,
      basedOnGenerationId: null,
      confirmedAt,
      content: confirmedOutline,
    }],
    activeConfirmedVersion: 1,
  };
  project.sectionDependencies = {
    [DEPENDENT_SECTION_ID]: {
      predecessorSectionId: PREDECESSOR_SECTION_ID,
      mode: "reference",
      updatedAt: confirmedAt,
    },
  };
  project.sectionDrafts = {};
  project.sectionReviews = {};

  const predecessorContent = content(
    PREDECESSOR_SECTION_ID,
    "项目背景",
    PREDECESSOR_BODY_SENTINEL,
    "A村是本次规划的唯一项目对象，规划期限以任务书为准。",
  );
  const predecessorDraft: SectionDraftDocument = {
    target: {
      confirmedOutlineVersion: 1,
      chapterId: DEPENDENCY_CHAPTER_ID,
      sectionId: PREDECESSOR_SECTION_ID,
      sectionTitle: "项目背景",
    },
    dependencySnapshot: null,
    latestSuggestion: null,
    workingDraft: {
      ...predecessorContent,
      revision: 1,
      basedOnGenerationId: null,
      updatedAt: confirmedAt,
    },
    versions: [],
  };
  project.sectionDrafts[PREDECESSOR_SECTION_ID] = predecessorDraft;

  let dependencySnapshot: SectionDependencySnapshot | null = null;
  if (confirmPredecessor && predecessorDraft.workingDraft) {
    const fingerprint = createDraftFingerprint(predecessorDraft.workingDraft, predecessorDraft.target);
    predecessorDraft.versions.push({
      ...predecessorContent,
      version: 1,
      basedOnWorkingRevision: 1,
      createdAt: confirmedAt,
      source: "section_confirmed",
      generationId: null,
    });
    project.sectionReviews[PREDECESSOR_SECTION_ID] = reviewDocument(
      predecessorDraft.workingDraft,
      predecessorDraft.target,
      fingerprint,
    );
    dependencySnapshot = {
      predecessorSectionId: PREDECESSOR_SECTION_ID,
      predecessorConfirmationId: `cnf_${PREDECESSOR_SECTION_ID}`,
      predecessorDraftRevision: 1,
      predecessorSectionSummary: predecessorContent.sectionSummary,
      essentialFacts: [
        "问题：规划边界需要统一",
        "策略：以已确认项目边界为准",
        "措施：统一项目名称和规划期限",
      ],
      capturedAt: confirmedAt,
    };
  }

  if (includeDependentDraft || confirmDependent) {
    const dependentContent = content(
      DEPENDENT_SECTION_ID,
      "规划范围与期限",
      "规划范围覆盖A村行政边界，期限以项目任务书为准。",
      "明确A村规划范围和期限。",
    );
    const dependentDraft: SectionDraftDocument = {
      target: {
        confirmedOutlineVersion: 1,
        chapterId: DEPENDENCY_CHAPTER_ID,
        sectionId: DEPENDENT_SECTION_ID,
        sectionTitle: "规划范围与期限",
      },
      dependencySnapshot,
      latestSuggestion: null,
      workingDraft: {
        ...dependentContent,
        revision: 1,
        basedOnGenerationId: null,
        updatedAt: confirmedAt,
      },
      versions: [],
    };
    project.sectionDrafts[DEPENDENT_SECTION_ID] = dependentDraft;
    if (confirmDependent && dependentDraft.workingDraft) {
      const fingerprint = createDraftFingerprint(
        dependentDraft.workingDraft,
        dependentDraft.target,
        dependencySnapshot,
      );
      dependentDraft.versions.push({
        ...dependentContent,
        version: 1,
        basedOnWorkingRevision: 1,
        createdAt: confirmedAt,
        source: "section_confirmed",
        generationId: null,
      });
      project.sectionReviews[DEPENDENT_SECTION_ID] = reviewDocument(
        dependentDraft.workingDraft,
        dependentDraft.target,
        fingerprint,
      );
    }
  }
  return project;
}
