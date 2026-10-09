import type { MaterialDocument } from "@/domain/materials/schema";
import type { ProjectDocument } from "@/domain/projects/schema";
import {
  createDraftFingerprint,
  createReviewInputFingerprint,
  type ReviewerInput,
  type SectionReviewDocument,
} from "@/server/reviewer/contracts";
import { resolveSectionDependency } from "@/server/dependencies/section-dependency";

export type ReviewerContextResult =
  | { ok: true; input: ReviewerInput; inputFingerprint: string }
  | { ok: false; error: "REVIEWER_TARGET_NOT_FOUND" | "REVIEWER_DRAFT_NOT_FOUND" | "REVIEWER_DRAFT_EMPTY" | "REVIEWER_INPUT_INSUFFICIENT" | "REVIEWER_DEPENDENCY_UNMET" };

function isUsableFact(material: MaterialDocument) {
  return material.materialParseStatus === "parsed"
    && material.materialVersionStatus === "current"
    && material.materialUsageStatus === "adopted"
    && (material.professionalConfirmationStatus === "not_required" || material.professionalConfirmationStatus === "confirmed");
}

export function buildReviewerContext(project: ProjectDocument, chapterId: string, sectionId: string): ReviewerContextResult {
  const active = project.plannerOutline.activeConfirmedVersion;
  const outline = active === null
    ? null
    : project.plannerOutline.confirmedVersions.find((version) => version.version === active)?.content;
  const chapter = outline?.chapters.find((item) => item.nodeId === chapterId);
  const section = chapter?.sections.find((item) => item.nodeId === sectionId);
  if (active === null || !chapter || !section) return { ok: false, error: "REVIEWER_TARGET_NOT_FOUND" };

  const stored = project.sectionDrafts[sectionId];
  if (!stored?.workingDraft
    || stored.target.confirmedOutlineVersion !== active
    || stored.target.chapterId !== chapterId
    || stored.target.sectionId !== sectionId) {
    return { ok: false, error: "REVIEWER_DRAFT_NOT_FOUND" };
  }
  if (!stored.workingDraft.contentMarkdown.trim()) return { ok: false, error: "REVIEWER_DRAFT_EMPTY" };
  const dependency = resolveSectionDependency(project, chapterId, sectionId);
  if (dependency.mode === "blocking" && dependency.status === "waiting") {
    return { ok: false, error: "REVIEWER_DEPENDENCY_UNMET" };
  }

  const adoptedFacts = project.materials
    .filter(isUsableFact)
    .map((material) => ({
      materialId: material.materialId,
      title: material.title,
      category: material.category,
      summary: material.summary,
    }));
  if (adoptedFacts.length === 0) return { ok: false, error: "REVIEWER_INPUT_INSUFFICIENT" };

  const target: SectionReviewDocument["target"] = {
    confirmedOutlineVersion: active,
    chapterId,
    sectionId,
    sectionTitle: section.title,
  };
  const savedDraft = {
    chapterNodeId: stored.workingDraft.chapterNodeId,
    sectionNodeId: stored.workingDraft.sectionNodeId,
    sectionTitle: stored.workingDraft.sectionTitle,
    contentMarkdown: stored.workingDraft.contentMarkdown,
    strategyMapping: stored.workingDraft.strategyMapping,
    sourceUsed: stored.workingDraft.sourceUsed,
    missingInfo: stored.workingDraft.missingInfo,
    humanConfirmation: stored.workingDraft.humanConfirmation,
    sectionSummary: stored.workingDraft.sectionSummary,
    revision: stored.workingDraft.revision,
  };
  const sourceFingerprint = createDraftFingerprint(savedDraft, target, dependency.snapshot);
  const input: ReviewerInput = {
    project: { projectId: project.projectId, name: project.name, projectType: project.projectType },
    activeConfirmedVersion: active,
    target: {
      chapterId,
      chapterTitle: chapter.title,
      sectionId,
      sectionTitle: section.title,
      purpose: section.purpose,
      writingFocus: section.keyPoints,
    },
    savedDraft,
    sourceFingerprint,
    adoptedFacts,
    referenceOnlyMaterials: project.materials
      .filter((material) => material.materialUsageStatus === "reference_only")
      .map((material) => ({ materialId: material.materialId, title: material.title, summary: material.summary })),
    confirmedProjectConstraints: project.materials
      .filter((material) => material.category === "user_requirements" && isUsableFact(material))
      .map((material) => material.summary),
    previousConfirmedSummaries: dependency.predecessor && dependency.snapshot ? [
      `前置子节 ${dependency.predecessor.chapterTitle} / ${dependency.predecessor.sectionTitle}（${dependency.predecessor.sectionId}）`,
      `${dependency.status === "ready" ? "确认摘要" : "暂定摘要"}：${dependency.snapshot.predecessorSectionSummary}`,
      ...dependency.snapshot.essentialFacts,
    ] : [],
    reviewCriteria: [
      "结构与格式",
      "内容覆盖",
      "事实与依据",
      "前后衔接",
      "专业表达",
    ],
  };
  return { ok: true, input, inputFingerprint: createReviewInputFingerprint(input) };
}
