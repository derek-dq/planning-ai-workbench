import type {
  ProjectDocument,
  SectionDependencySnapshot,
} from "@/domain/projects/schema";
import type { PlannerOutlineNode } from "@/server/planner/contracts";
import { createDraftFingerprint } from "@/server/reviewer/contracts";

export type SectionDependencyCandidate = {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
};

export type SectionDependencyState = {
  status: "none" | "provisional" | "waiting" | "ready" | "stale";
  mode: "none" | "reference" | "blocking";
  source: "none" | "planner" | "user";
  predecessor: SectionDependencyCandidate | null;
  candidates: SectionDependencyCandidate[];
  snapshot: SectionDependencySnapshot | null;
  reason: string | null;
};

type OutlineSection = SectionDependencyCandidate & { task: PlannerOutlineNode };

function activeSections(project: ProjectDocument): OutlineSection[] {
  const active = project.plannerOutline.activeConfirmedVersion;
  const outline = active === null
    ? null
    : project.plannerOutline.confirmedVersions.find((item) => item.version === active)?.content;
  return outline?.chapters.flatMap((chapter) => chapter.sections.map((section) => ({
    chapterId: chapter.nodeId,
    chapterTitle: chapter.title,
    sectionId: section.nodeId,
    sectionTitle: section.title,
    task: section,
  }))) ?? [];
}

export function resolveSectionDependency(
  project: ProjectDocument,
  chapterId: string,
  sectionId: string,
): SectionDependencyState {
  const sections = activeSections(project);
  const target = sections.find((item) => item.chapterId === chapterId && item.sectionId === sectionId);
  if (!target) {
    return { status: "none", mode: "none", source: "none", predecessor: null, candidates: [], snapshot: null, reason: null };
  }
  const candidates = sections
    .filter((item) => item.sectionId !== sectionId)
    .map((item) => ({
      chapterId: item.chapterId,
      chapterTitle: item.chapterTitle,
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
    }));
  const configured = project.sectionDependencies[sectionId];
  const plannerDefault = target.task.prerequisiteNodeIds.find((id) => sections.some((item) => item.sectionId === id));
  const mode = configured?.mode ?? (plannerDefault ? "reference" : "none");
  const predecessorId = configured
    ? configured.mode === "none" ? null : configured.predecessorSectionId
    : plannerDefault;
  const source = configured ? "user" : plannerDefault ? "planner" : "none";
  if (!predecessorId) {
    return { status: "none", mode, source, predecessor: null, candidates, snapshot: null, reason: null };
  }
  const predecessor = sections.find((item) => item.sectionId === predecessorId);
  if (!predecessor) {
    return {
      status: mode === "blocking" ? "waiting" : "provisional",
      mode,
      source,
      predecessor: null,
      candidates,
      snapshot: null,
      reason: "前置子节不在当前确认目录中。",
    };
  }
  const predecessorDraft = project.sectionDrafts[predecessor.sectionId];
  const predecessorReview = project.sectionReviews[predecessor.sectionId];
  if (!predecessorDraft?.workingDraft) {
    return {
      status: mode === "blocking" ? "waiting" : "provisional",
      mode,
      source,
      predecessor,
      candidates,
      snapshot: null,
      reason: mode === "blocking"
        ? "硬依赖的前置子节尚无可用内容。"
        : "前置子节尚无已保存内容，当前子节可以并行编制。",
    };
  }
  const reference = {
    confirmedOutlineVersion: project.plannerOutline.activeConfirmedVersion!,
    chapterId: predecessor.chapterId,
    sectionId: predecessor.sectionId,
    sectionTitle: predecessor.sectionTitle,
  };
  const fingerprint = createDraftFingerprint(predecessorDraft.workingDraft, reference);
  const stored = project.sectionDrafts[sectionId]?.dependencySnapshot;
  const confirmation = [...(predecessorReview?.confirmations ?? [])].reverse().find((item) =>
    item.draftRevision === predecessorDraft.workingDraft?.revision
    && item.sourceFingerprint === fingerprint);
  const sourceContent = confirmation
    ? [...predecessorDraft.versions].reverse().find((item) =>
      item.source === "section_confirmed"
      && item.basedOnWorkingRevision === confirmation.draftRevision) ?? predecessorDraft.workingDraft
    : predecessorDraft.workingDraft;
  const essentialFacts = sourceContent.strategyMapping.slice(0, 8).flatMap((item) => [
    `问题：${item.problem}`,
    `策略：${item.strategy}`,
    ...item.measures.slice(0, 4).map((measure) => `措施：${measure}`),
  ]);
  const snapshot: SectionDependencySnapshot = {
    predecessorSectionId: predecessor.sectionId,
    predecessorConfirmationId: confirmation?.confirmationId ?? `draft_${predecessorDraft.workingDraft.revision}`,
    predecessorDraftRevision: predecessorDraft.workingDraft.revision,
    predecessorSectionSummary: sourceContent.sectionSummary,
    essentialFacts,
    capturedAt: confirmation?.confirmedAt ?? predecessorDraft.workingDraft.updatedAt,
  };
  if (!confirmation && mode === "blocking") {
    return {
      status: "waiting",
      mode,
      source,
      predecessor,
      candidates,
      snapshot,
      reason: "硬依赖的前置子节尚未完成有效确认。",
    };
  }
  const stale = Boolean(stored && (
    stored.predecessorSectionId !== snapshot.predecessorSectionId
    || stored.predecessorConfirmationId !== snapshot.predecessorConfirmationId
    || stored.predecessorDraftRevision !== snapshot.predecessorDraftRevision
  ));
  return {
    status: stale ? "stale" : confirmation ? "ready" : "provisional",
    mode,
    source,
    predecessor,
    candidates,
    snapshot,
    reason: stale
      ? "前置内容已变化，当前子节需要重新校核。"
      : confirmation
        ? null
        : "当前使用前置子节的暂定摘要，可并行编制；正式确认前需完成前置确认并重新校核。",
  };
}

export function validateDependencySelection(
  project: ProjectDocument,
  targetSectionId: string,
  mode: "none" | "reference" | "blocking",
  predecessorSectionId: string | null,
): boolean {
  const sections = activeSections(project);
  if (!sections.some((item) => item.sectionId === targetSectionId)) return false;
  if (mode === "none") return predecessorSectionId === null;
  if (!predecessorSectionId
    || targetSectionId === predecessorSectionId
    || !sections.some((item) => item.sectionId === predecessorSectionId)) return false;
  const configured = {
    ...project.sectionDependencies,
    [targetSectionId]: { predecessorSectionId, mode, updatedAt: new Date(0).toISOString() },
  };
  const defaultDependency = (sectionId: string) => {
    const item = sections.find((section) => section.sectionId === sectionId);
    return item?.task.prerequisiteNodeIds.find((id) => sections.some((section) => section.sectionId === id));
  };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (sectionId: string): boolean => {
    if (visiting.has(sectionId)) return true;
    if (visited.has(sectionId)) return false;
    visiting.add(sectionId);
    const config = configured[sectionId];
    const dependency = config
      ? config.mode === "none" ? undefined : config.predecessorSectionId ?? undefined
      : defaultDependency(sectionId);
    if (dependency && visit(dependency)) return true;
    visiting.delete(sectionId);
    visited.add(sectionId);
    return false;
  };
  return !sections.some((item) => visit(item.sectionId));
}
