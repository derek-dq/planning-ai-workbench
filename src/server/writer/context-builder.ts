import { evaluateMaterialReadiness, type MaterialDocument } from "@/domain/materials/schema";
import type { ProjectDocument } from "@/domain/projects/schema";
import { createWriterInputFingerprint, type WriterInput } from "@/server/writer/contracts";
import { resolveSectionDependency } from "@/server/dependencies/section-dependency";

export type WriterContextResult = { ok: true; input: WriterInput; inputFingerprint: string } | { ok: false; error: "WRITER_INPUT_INSUFFICIENT" | "WRITER_TARGET_NOT_FOUND" | "WRITER_DEPENDENCY_UNMET"; blockingMissing: string[] };

function usable(material: MaterialDocument) { return material.materialParseStatus === "parsed" && material.materialVersionStatus === "current" && material.materialUsageStatus !== "excluded" && (material.professionalConfirmationStatus === "not_required" || material.professionalConfirmationStatus === "confirmed"); }

export function buildWriterContext(project: ProjectDocument, chapterId: string, sectionId: string): WriterContextResult {
  const readiness = evaluateMaterialReadiness(project.materials);
  if (!readiness.canGenerate) return { ok: false, error: "WRITER_INPUT_INSUFFICIENT", blockingMissing: readiness.blockingMissing.map((item) => item.title) };
  const active = project.plannerOutline.activeConfirmedVersion;
  const outline = active === null ? null : project.plannerOutline.confirmedVersions.find((version) => version.version === active)?.content;
  const chapter = outline?.chapters.find((item) => item.nodeId === chapterId);
  const section = chapter?.sections.find((item) => item.nodeId === sectionId);
  if (active === null || !chapter || !section) return { ok: false, error: "WRITER_TARGET_NOT_FOUND", blockingMissing: [] };
  if (section.writerType === null) {
    return { ok: false, error: "WRITER_INPUT_INSUFFICIENT", blockingMissing: ["待确认写作类型"] };
  }
  const dependency = resolveSectionDependency(project, chapterId, sectionId);
  if (dependency.mode === "blocking" && dependency.status === "waiting") {
    return {
      ok: false,
      error: "WRITER_DEPENDENCY_UNMET",
      blockingMissing: [dependency.reason ?? "前置子节尚未确认。"],
    };
  }
  const adoptedMaterials = project.materials.filter(usable).sort((a, b) => a.materialId.localeCompare(b.materialId)).map((material) => ({ materialId: material.materialId, title: material.title, category: material.category, summary: material.summary }));
  const input: WriterInput = {
    confirmedOutlineVersion: active,
    project: { projectId: project.projectId, name: project.name, projectType: project.projectType },
    target: {
      chapterNodeId: chapter.nodeId,
      sectionNodeId: section.nodeId,
      sectionTitle: section.title,
      writerType: section.writerType,
      writingFocus: section.keyPoints,
      requiredMaterials: section.requiredMaterials.map((item) => item.name),
    },
    adoptedMaterials,
    knownMissingMaterials: readiness.knownMissingMaterials.map((item) => `${item.title}：${item.reason}`),
    pendingProfessionalConfirmations: readiness.pendingProfessionalConfirmations.map((item) => `${item.title}：${item.reason}`),
    userNotes: project.materials.filter((item) => item.category === "user_requirements" && usable(item)).map((item) => item.summary),
    predecessorContext: dependency.predecessor && dependency.snapshot ? {
      basis: dependency.status === "ready" ? "confirmed" : "provisional",
      chapterId: dependency.predecessor.chapterId,
      sectionId: dependency.predecessor.sectionId,
      sectionTitle: dependency.predecessor.sectionTitle,
      confirmationId: dependency.snapshot.predecessorConfirmationId,
      confirmedAt: dependency.snapshot.capturedAt,
      sectionSummary: dependency.snapshot.predecessorSectionSummary,
      essentialFacts: dependency.snapshot.essentialFacts,
    } : null,
  };
  const inputFingerprint = createWriterInputFingerprint(input);
  return { ok: true, input, inputFingerprint };
}
