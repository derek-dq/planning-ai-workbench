import type { ProjectDocument } from "@/domain/projects/schema";
import { resolveSectionDependency } from "@/server/dependencies/section-dependency";
import { createDraftFingerprint, type ReviewIssueType } from "@/server/reviewer/contracts";

export type DeliverableSectionStatus =
  | "not_started"
  | "waiting"
  | "in_progress"
  | "must_fix"
  | "professional_confirmation"
  | "confirmed";

export { DELIVERABLE_STATUS_LABELS } from "@/domain/deliverable-labels";

export type DeliverableSectionSummary = {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  status: DeliverableSectionStatus;
  detail: string;
  unresolvedIssues: Array<{
    issueId: string;
    type: ReviewIssueType;
    problem: string;
  }>;
};

export type ExportableSection = {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  confirmedAt: string;
  confirmationVersion: number;
  contentMarkdown: string;
  sourceTitles: string[];
};

export type DeliverablesSummary = {
  projectId: string;
  projectName: string;
  sections: DeliverableSectionSummary[];
  exportableSections: ExportableSection[];
  unresolvedIssueCount: number;
  professionalConfirmationCount: number;
  wordExportAvailable: false;
  wordExportUnavailableReason: "WORD_EXPORT_UNAVAILABLE";
};

export function buildDeliverablesSummary(project: ProjectDocument): DeliverablesSummary {
  const active = project.plannerOutline.activeConfirmedVersion;
  const outline = active === null
    ? null
    : project.plannerOutline.confirmedVersions.find((item) => item.version === active)?.content;
  const sections: DeliverableSectionSummary[] = [];
  const exportableSections: ExportableSection[] = [];

  for (const chapter of outline?.chapters ?? []) {
    for (const section of chapter.sections) {
      const dependency = resolveSectionDependency(project, chapter.nodeId, section.nodeId);
      const draft = project.sectionDrafts[section.nodeId];
      const review = project.sectionReviews[section.nodeId];
      const latestRun = review?.runs.at(-1);
      const target = {
        confirmedOutlineVersion: active!,
        chapterId: chapter.nodeId,
        sectionId: section.nodeId,
        sectionTitle: section.title,
      };
      const fingerprint = draft?.workingDraft
        ? createDraftFingerprint(draft.workingDraft, target, dependency.snapshot)
        : null;
      const reviewCurrent = Boolean(latestRun && draft?.workingDraft && fingerprint
        && latestRun.sourceDraftRevision === draft.workingDraft.revision
        && latestRun.sourceFingerprint === fingerprint
        && dependency.status !== "waiting"
        && dependency.status !== "stale");
      const unresolvedIssues = reviewCurrent && latestRun ? latestRun.issues.filter((issue) => {
        const state = review?.issueStates[issue.issueId];
        if (issue.type === "suggestion") return false;
        return !state || state.status === "open" || state.status === "manual_required";
      }).map((issue) => ({ issueId: issue.issueId, type: issue.type, problem: issue.problem })) : [];
      const dependencyReadyForConfirmation = dependency.status === "none" || dependency.status === "ready";
      const confirmation = dependencyReadyForConfirmation && reviewCurrent && draft?.workingDraft && fingerprint
        ? [...(review?.confirmations ?? [])].reverse().find((item) =>
          item.draftRevision === draft.workingDraft?.revision
          && item.sourceFingerprint === fingerprint)
        : undefined;

      let status: DeliverableSectionStatus = "not_started";
      let detail = "尚无人工草稿。";
      if (dependency.mode === "blocking" && dependency.status === "waiting") {
        status = "waiting";
        detail = dependency.reason ?? "前置子节尚未确认。";
      } else if (unresolvedIssues.some((item) => item.type === "must_fix")) {
        status = "must_fix";
        detail = "存在未解决的必须处理问题。";
      } else if (unresolvedIssues.some((item) => item.type === "professional_confirmation")) {
        status = "professional_confirmation";
        detail = "存在待规划设计人员处理的专业确认事项。";
      } else if (confirmation) {
        status = "confirmed";
        detail = `确认版本 ${confirmation.version} · ${new Date(confirmation.confirmedAt).toLocaleString("zh-CN")}`;
      } else if (draft?.workingDraft) {
        status = "in_progress";
        detail = dependency.status === "stale"
          ? "前置确认已变化，需要重新校核。"
          : dependency.status === "provisional"
            ? "正在基于暂定前置内容并行编制，正式确认前需重新校核。"
            : latestRun && !reviewCurrent ? "正文或依赖已变化，需要重新校核。" : "已有工作草稿。";
      } else if (dependency.status === "provisional") {
        detail = "可并行编制；当前前置内容尚未确认。";
      }

      sections.push({
        chapterId: chapter.nodeId,
        chapterTitle: chapter.title,
        sectionId: section.nodeId,
        sectionTitle: section.title,
        status,
        detail,
        unresolvedIssues,
      });

      if (status === "confirmed" && confirmation && draft?.workingDraft) {
        const confirmedSnapshot = [...draft.versions].reverse().find((item) =>
          item.source === "section_confirmed"
          && item.basedOnWorkingRevision === confirmation.draftRevision);
        if (confirmedSnapshot) {
          exportableSections.push({
            chapterId: chapter.nodeId,
            chapterTitle: chapter.title,
            sectionId: section.nodeId,
            sectionTitle: section.title,
            confirmedAt: confirmation.confirmedAt,
            confirmationVersion: confirmation.version,
            contentMarkdown: confirmedSnapshot.contentMarkdown,
            sourceTitles: confirmedSnapshot.sourceUsed.map((materialId) =>
              project.materials.find((material) => material.materialId === materialId)?.title ?? materialId),
          });
        }
      }
    }
  }

  return {
    projectId: project.projectId,
    projectName: project.name,
    sections,
    exportableSections,
    unresolvedIssueCount: sections.reduce((sum, item) => sum + item.unresolvedIssues.length, 0),
    professionalConfirmationCount: sections.reduce((sum, item) =>
      sum + item.unresolvedIssues.filter((issue) => issue.type === "professional_confirmation").length, 0),
    wordExportAvailable: false,
    wordExportUnavailableReason: "WORD_EXPORT_UNAVAILABLE",
  };
}
