import { randomUUID } from "node:crypto";
import path from "node:path";

import { demoMaterials } from "@/domain/materials/demo-materials";
import {
  evaluateMaterialReadiness,
  validateMaterialUsageInput,
  type MaterialDocument,
  type MaterialReadiness,
} from "@/domain/materials/schema";
import { demoProject } from "@/domain/projects/demo-project";
import {
  createEmptyPlannerOutline,
  migrateProjectDocument,
  PROJECT_SCHEMA_VERSION,
  validateCreateProjectInput,
  validateEditProjectInput,
  validateProjectDocument,
  validateProjectId,
  type PlannerOutlineDocument,
  type ProjectDocument,
  type SectionDependencyConfig,
  type SectionDraftDocument,
} from "@/domain/projects/schema";
import {
  resolveSectionDependency,
  validateDependencySelection,
} from "@/server/dependencies/section-dependency";
import {
  validatePlannerOutput,
  validatePlannerSuggestion,
  type PlannerOutput,
  type PlannerSuggestion,
} from "@/server/planner/contracts";
import {
  validateWriterSuggestion,
  type WriterContent,
  type WriterSuggestion,
} from "@/server/writer/contracts";
import {
  createDraftFingerprint,
  type ReviewIssueState,
  type ReviewRevisionSuggestion,
  type ReviewRun,
  type SectionConfirmation,
  type SectionReviewDocument,
} from "@/server/reviewer/contracts";
import { createNodeProjectFileSystem, type ProjectFileSystemPort } from "./file-system";

export type ProjectSummary = Pick<ProjectDocument, "projectId" | "name" | "projectType" | "createdAt" | "updatedAt">;
export type ProjectReadIssue = { fileName: string; code: "PROJECT_READ_FAILED" | "PROJECT_SCHEMA_UNSUPPORTED" };
export type ProjectListResult = { projects: ProjectSummary[]; issues: ProjectReadIssue[] };
export type ProjectMaterialsResult = {
  materials: MaterialDocument[];
  readiness: MaterialReadiness;
};
export type ProjectRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ID_INVALID"
  | "PROJECT_READ_FAILED"
  | "PROJECT_SCHEMA_UNSUPPORTED"
  | "PROJECT_SEED_FAILED"
  | "PROJECT_VALIDATION_FAILED"
  | "PROJECT_WRITE_FAILED"
  | "MATERIAL_NOT_FOUND"
  | "MATERIAL_VALIDATION_FAILED"
  | "PLANNER_SUGGESTION_VALIDATION_FAILED"
  | "OUTLINE_NOT_FOUND"
  | "OUTLINE_VALIDATION_FAILED"
  | "OUTLINE_CONFIRM_CONFLICT"
  | "OUTLINE_WRITE_FAILED"
  | "SECTION_TARGET_NOT_FOUND"
  | "SECTION_DRAFT_NOT_FOUND"
  | "SECTION_DRAFT_VALIDATION_FAILED"
  | "SECTION_DRAFT_CONFLICT"
  | "SECTION_DRAFT_WRITE_FAILED"
  | "SECTION_DEPENDENCY_INVALID"
  | "SECTION_DEPENDENCY_UNMET"
  | "SECTION_REVIEW_NOT_FOUND"
  | "SECTION_REVIEW_STALE"
  | "SECTION_REVIEW_VALIDATION_FAILED"
  | "SECTION_REVIEW_WRITE_FAILED"
  | "SECTION_REVIEW_BLOCKED"
  | "REVIEW_ISSUE_NOT_FOUND"
  | "REVIEW_ISSUE_ATTEMPTS_EXHAUSTED"
  | "REVIEW_REVISION_NOT_FOUND";

export class ProjectRepositoryError extends Error {
  constructor(public readonly code: ProjectRepositoryErrorCode) {
    super(code);
    this.name = "ProjectRepositoryError";
  }
}

export class ProjectRepository {
  private readonly itemsDirectory: string;

  constructor(
    private readonly options: { dataRoot?: string; fileSystem?: ProjectFileSystemPort } = {},
  ) {
    this.itemsDirectory = path.join(options.dataRoot ?? path.join(process.cwd(), ".local-data", "projects"), "items");
  }

  private get fileSystem() {
    return this.options.fileSystem ?? createNodeProjectFileSystem();
  }

  async initialize(): Promise<void> {
    try {
      await this.fileSystem.ensureDirectory(this.itemsDirectory);
      const files = await this.fileSystem.listJsonFileNames(this.itemsDirectory);
      if (files.length > 0) return;
      const seedValidation = validateProjectDocument(demoProject);
      if (!seedValidation.ok) throw new ProjectRepositoryError("PROJECT_SEED_FAILED");
      await this.writeProjectDocument(seedValidation.value);
    } catch (error) {
      if (error instanceof ProjectRepositoryError) throw error;
      throw new ProjectRepositoryError("PROJECT_SEED_FAILED");
    }
  }

  async list(): Promise<ProjectListResult> {
    await this.initialize();
    let fileNames: string[];
    try {
      fileNames = await this.fileSystem.listJsonFileNames(this.itemsDirectory);
    } catch {
      throw new ProjectRepositoryError("PROJECT_READ_FAILED");
    }
    const projects: ProjectSummary[] = [];
    const issues: ProjectReadIssue[] = [];
    for (const fileName of fileNames) {
      const result = await this.readProjectFile(path.join(this.itemsDirectory, fileName), fileName.slice(0, -5));
      if (result.ok) projects.push(toProjectSummary(result.value));
      else issues.push({
        fileName,
        code: result.code === "PROJECT_SCHEMA_UNSUPPORTED" ? "PROJECT_SCHEMA_UNSUPPORTED" : "PROJECT_READ_FAILED",
      });
    }
    projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return { projects, issues };
  }

  async getById(projectId: string): Promise<ProjectDocument> {
    const validId = validateProjectId(projectId);
    if (!validId.ok) throw new ProjectRepositoryError("PROJECT_ID_INVALID");
    await this.initialize();
    const result = await this.readProjectFile(this.filePathFor(validId.value), validId.value, true);
    if (!result.ok) throw new ProjectRepositoryError(result.code);
    return result.value;
  }

  async create(input: unknown): Promise<ProjectDocument> {
    const validation = validateCreateProjectInput(input);
    if (!validation.ok) throw new ProjectRepositoryError(validation.error);
    await this.initialize();
    const fileNames = await this.fileSystem.listJsonFileNames(this.itemsDirectory).catch(() => { throw new ProjectRepositoryError("PROJECT_READ_FAILED"); });
    let projectId = this.generateProjectId();
    while (fileNames.includes(`${projectId}.json`)) projectId = this.generateProjectId();
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectId,
      ...validation.value,
      createdAt: now,
      updatedAt: now,
      materials: [],
      plannerOutline: createEmptyPlannerOutline(),
      sectionDependencies: {},
      sectionDrafts: {},
      sectionReviews: {},
    };
    await this.writeProjectDocument(project);
    return project;
  }

  async update(projectId: string, input: unknown): Promise<ProjectDocument> {
    const validation = validateEditProjectInput(input);
    if (!validation.ok) throw new ProjectRepositoryError(validation.error);
    const existing = await this.getById(projectId);
    const project: ProjectDocument = { ...existing, ...validation.value, updatedAt: new Date().toISOString() };
    await this.writeProjectDocument(project);
    return project;
  }

  async getMaterials(projectId: string): Promise<ProjectMaterialsResult> {
    const project = await this.getById(projectId);
    return {
      materials: project.materials,
      readiness: evaluateMaterialReadiness(project.materials),
    };
  }

  async updateMaterialUsage(
    projectId: string,
    materialId: string,
    input: unknown,
  ): Promise<{ material: MaterialDocument; readiness: MaterialReadiness }> {
    const validation = validateMaterialUsageInput(input);
    if (!validation.ok) throw new ProjectRepositoryError(validation.error);
    const project = await this.getById(projectId);
    const materialIndex = project.materials.findIndex((material) => material.materialId === materialId);
    if (materialIndex < 0) throw new ProjectRepositoryError("MATERIAL_NOT_FOUND");
    const now = new Date().toISOString();
    const material = {
      ...project.materials[materialIndex],
      materialUsageStatus: validation.value.materialUsageStatus,
      updatedAt: now,
    };
    const materials = project.materials.map((item, index) => index === materialIndex ? material : item);
    await this.writeProjectDocument({ ...project, materials, updatedAt: now });
    return { material, readiness: evaluateMaterialReadiness(materials) };
  }

  async saveLatestSuggestion(
    projectId: string,
    suggestion: unknown,
  ): Promise<PlannerSuggestion> {
    if (!validatePlannerSuggestion(suggestion)) {
      throw new ProjectRepositoryError("PLANNER_SUGGESTION_VALIDATION_FAILED");
    }
    const project = await this.getById(projectId);
    const now = new Date().toISOString();
    await this.writeProjectDocument({
      ...project,
      updatedAt: now,
      plannerOutline: {
        ...project.plannerOutline,
        latestSuggestion: suggestion,
      },
    });
    return suggestion;
  }

  async applyLatestSuggestion(projectId: string): Promise<PlannerOutlineDocument> {
    const project = await this.getById(projectId);
    const suggestion = project.plannerOutline.latestSuggestion;
    if (!suggestion) throw new ProjectRepositoryError("OUTLINE_NOT_FOUND");
    const now = new Date().toISOString();
    const workingOutline = {
      revision: (project.plannerOutline.workingOutline?.revision ?? 0) + 1,
      basedOnGenerationId: suggestion.generationId,
      updatedAt: now,
      content: structuredClone(suggestion.content),
    };
    const plannerOutline = { ...project.plannerOutline, workingOutline };
    await this.writeOutlineProject({ ...project, updatedAt: now, plannerOutline });
    return plannerOutline;
  }

  async saveWorkingOutline(
    projectId: string,
    input: unknown,
  ): Promise<PlannerOutlineDocument> {
    const project = await this.getById(projectId);
    const current = project.plannerOutline.workingOutline;
    if (!current) throw new ProjectRepositoryError("OUTLINE_NOT_FOUND");
    if (!isWorkingOutlineSaveInput(input) || input.expectedRevision !== current.revision) {
      throw new ProjectRepositoryError(isWorkingOutlineSaveInput(input) ? "OUTLINE_CONFIRM_CONFLICT" : "OUTLINE_VALIDATION_FAILED");
    }
    const content = validateWorkingOutlineContent(input.content, project);
    if (!content) throw new ProjectRepositoryError("OUTLINE_VALIDATION_FAILED");
    const now = new Date().toISOString();
    const plannerOutline: PlannerOutlineDocument = {
      ...project.plannerOutline,
      workingOutline: {
        revision: current.revision + 1,
        basedOnGenerationId: current.basedOnGenerationId,
        updatedAt: now,
        content,
      },
    };
    await this.writeOutlineProject({ ...project, updatedAt: now, plannerOutline });
    return plannerOutline;
  }

  async confirmWorkingOutline(projectId: string, input: unknown): Promise<PlannerOutlineDocument> {
    const project = await this.getById(projectId);
    const current = project.plannerOutline.workingOutline;
    if (!current) throw new ProjectRepositoryError("OUTLINE_NOT_FOUND");
    if (!isConfirmationInput(input)) throw new ProjectRepositoryError("OUTLINE_VALIDATION_FAILED");
    if (input.expectedRevision !== current.revision) throw new ProjectRepositoryError("OUTLINE_CONFIRM_CONFLICT");
    const content = validateWorkingOutlineContent(current.content, project);
    if (!content) throw new ProjectRepositoryError("OUTLINE_VALIDATION_FAILED");
    const now = new Date().toISOString();
    const version = project.plannerOutline.confirmedVersions.length + 1;
    const plannerOutline: PlannerOutlineDocument = {
      ...project.plannerOutline,
      confirmedVersions: [
        ...project.plannerOutline.confirmedVersions,
        {
          version,
          basedOnWorkingRevision: current.revision,
          basedOnGenerationId: current.basedOnGenerationId,
          confirmedAt: now,
          content: structuredClone(content),
        },
      ],
      activeConfirmedVersion: version,
    };
    await this.writeOutlineProject({ ...project, updatedAt: now, plannerOutline });
    return plannerOutline;
  }

  async getSectionDraft(projectId: string, chapterId: string, sectionId: string) {
    const project = await this.getById(projectId);
    const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const existing = project.sectionDrafts[sectionId];
    const draft = existing && sameSectionTarget(existing.target, target.reference) ? existing : null;
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    return { target: target.reference, task: target.task, materials: project.materials, draft, dependency };
  }

  async updateSectionDependency(
    projectId: string,
    chapterId: string,
    sectionId: string,
    input: unknown,
  ) {
    if (!isSectionDependencyInput(input)) throw new ProjectRepositoryError("SECTION_DEPENDENCY_INVALID");
    const project = await this.getById(projectId);
    getConfirmedSectionTarget(project, chapterId, sectionId);
    if (!validateDependencySelection(project, sectionId, input.mode, input.predecessorSectionId)) {
      throw new ProjectRepositoryError("SECTION_DEPENDENCY_INVALID");
    }
    const now = new Date().toISOString();
    const config: SectionDependencyConfig = {
      predecessorSectionId: input.predecessorSectionId,
      mode: input.mode,
      updatedAt: now,
    };
    const next = {
      ...project,
      updatedAt: now,
      sectionDependencies: { ...project.sectionDependencies, [sectionId]: config },
    };
    await this.writeSectionDraftProject(next);
    return resolveSectionDependency(next, chapterId, sectionId);
  }

  async saveSectionDraft(projectId: string, chapterId: string, sectionId: string, input: unknown): Promise<SectionDraftDocument> {
    if (!isSectionDraftSaveInput(input)) throw new ProjectRepositoryError("SECTION_DRAFT_VALIDATION_FAILED");
    const project = await this.getById(projectId);
    const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    const stored = project.sectionDrafts[sectionId];
    const previous = stored && sameSectionTarget(stored.target, target.reference) ? stored : null;
    const currentRevision = previous?.workingDraft?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) throw new ProjectRepositoryError("SECTION_DRAFT_CONFLICT");
    const now = new Date().toISOString();
    const inherited: WriterContent = previous?.workingDraft ?? previous?.latestSuggestion?.content ?? emptyWriterContent(target.reference);
    const draft: SectionDraftDocument = {
      target: target.reference,
      dependencySnapshot: dependency.snapshot,
      latestSuggestion: previous?.latestSuggestion ?? null,
      workingDraft: { ...inherited, revision: currentRevision + 1, basedOnGenerationId: previous?.workingDraft?.basedOnGenerationId ?? null, contentMarkdown: input.contentMarkdown, updatedAt: now },
      versions: previous?.versions ?? [],
    };
    await this.writeSectionDraftProject({ ...project, updatedAt: now, sectionDrafts: { ...project.sectionDrafts, [sectionId]: draft } });
    return draft;
  }

  async createSectionDraftVersion(projectId: string, chapterId: string, sectionId: string, input: unknown): Promise<SectionDraftDocument> {
    if (!isSectionDraftVersionInput(input)) throw new ProjectRepositoryError("SECTION_DRAFT_VALIDATION_FAILED");
    const project = await this.getById(projectId);
    const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const stored = project.sectionDrafts[sectionId];
    const previous = stored && sameSectionTarget(stored.target, target.reference) ? stored : undefined;
    if (!previous?.workingDraft) throw new ProjectRepositoryError("SECTION_DRAFT_NOT_FOUND");
    if (input.expectedRevision !== previous.workingDraft.revision) throw new ProjectRepositoryError("SECTION_DRAFT_CONFLICT");
    const now = new Date().toISOString();
    const draft: SectionDraftDocument = {
      ...previous,
      versions: [...previous.versions, { ...toDraftSnapshotContent(previous.workingDraft), version: previous.versions.length + 1, basedOnWorkingRevision: previous.workingDraft.revision, createdAt: now, source: "manual_snapshot", generationId: previous.workingDraft.basedOnGenerationId }],
    };
    await this.writeSectionDraftProject({ ...project, updatedAt: now, sectionDrafts: { ...project.sectionDrafts, [sectionId]: draft } });
    return draft;
  }

  async saveSectionSuggestion(projectId: string, chapterId: string, sectionId: string, suggestion: WriterSuggestion): Promise<WriterSuggestion> {
    if (!validateWriterSuggestion(suggestion)) throw new ProjectRepositoryError("SECTION_DRAFT_VALIDATION_FAILED");
    const project = await this.getById(projectId); const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    if (dependency.mode === "blocking" && dependency.status === "waiting") {
      throw new ProjectRepositoryError("SECTION_DEPENDENCY_UNMET");
    }
    if (suggestion.content.chapterNodeId !== target.reference.chapterId || suggestion.content.sectionNodeId !== target.reference.sectionId || suggestion.content.sectionTitle !== target.reference.sectionTitle) throw new ProjectRepositoryError("SECTION_DRAFT_VALIDATION_FAILED");
    const stored = project.sectionDrafts[sectionId];
    const previous = stored && sameSectionTarget(stored.target, target.reference) ? stored : undefined;
    const draft: SectionDraftDocument = {
      target: target.reference,
      dependencySnapshot: dependency.snapshot,
      latestSuggestion: suggestion,
      workingDraft: previous?.workingDraft ?? null,
      versions: previous?.versions ?? [],
    };
    await this.writeSectionDraftProject({ ...project, updatedAt: new Date().toISOString(), sectionDrafts: { ...project.sectionDrafts, [sectionId]: draft } });
    return suggestion;
  }

  async applySectionSuggestion(projectId: string, chapterId: string, sectionId: string, input: unknown): Promise<SectionDraftDocument> {
    if (!isSectionDraftApplyInput(input)) throw new ProjectRepositoryError("SECTION_DRAFT_VALIDATION_FAILED");
    const project = await this.getById(projectId); const target = getConfirmedSectionTarget(project, chapterId, sectionId); const stored = project.sectionDrafts[sectionId]; const previous = stored && sameSectionTarget(stored.target, target.reference) ? stored : undefined;
    if (!previous?.latestSuggestion) throw new ProjectRepositoryError("SECTION_DRAFT_NOT_FOUND");
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    if ((dependency.mode === "blocking" && dependency.status === "waiting") || dependency.status === "stale") {
      throw new ProjectRepositoryError("SECTION_DEPENDENCY_UNMET");
    }
    const currentRevision = previous.workingDraft?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) throw new ProjectRepositoryError("SECTION_DRAFT_CONFLICT");
    const now = new Date().toISOString(); const content = structuredClone(previous.latestSuggestion.content);
    const workingDraft = { ...content, revision: currentRevision + 1, basedOnGenerationId: previous.latestSuggestion.generationId, updatedAt: now };
    const draft: SectionDraftDocument = { target: target.reference, dependencySnapshot: dependency.snapshot, latestSuggestion: previous.latestSuggestion, workingDraft, versions: [...previous.versions, { ...content, version: previous.versions.length + 1, basedOnWorkingRevision: workingDraft.revision, createdAt: now, source: "ai_applied", generationId: previous.latestSuggestion.generationId }] };
    await this.writeSectionDraftProject({ ...project, updatedAt: now, sectionDrafts: { ...project.sectionDrafts, [sectionId]: draft } });
    return draft;
  }

  async getSectionReview(projectId: string, chapterId: string, sectionId: string) {
    const project = await this.getById(projectId);
    const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const draft = project.sectionDrafts[sectionId];
    const validDraft = draft && sameSectionTarget(draft.target, target.reference) ? draft : null;
    const review = project.sectionReviews[sectionId];
    const validReview = review && sameReviewTarget(review.target, target.reference) ? review : null;
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    const latestRun = validReview?.runs.at(-1) ?? null;
    const sourceFingerprint = validDraft?.workingDraft
      ? createDraftFingerprint(toDraftWithRevision(validDraft.workingDraft), target.reference, dependency.snapshot)
      : null;
    const isLatestReviewCurrent = Boolean(latestRun && sourceFingerprint
      && latestRun.sourceDraftRevision === validDraft?.workingDraft?.revision
      && latestRun.sourceFingerprint === sourceFingerprint
      && dependency.status !== "waiting"
      && dependency.status !== "stale");
    return {
      project,
      target: target.reference,
      task: target.task,
      draft: validDraft,
      review: validReview,
      latestRun,
      sourceFingerprint,
      isLatestReviewCurrent,
      dependency,
    };
  }

  async appendReviewRun(projectId: string, chapterId: string, sectionId: string, run: ReviewRun): Promise<ReviewRun> {
    const project = await this.getById(projectId);
    const target = getConfirmedSectionTarget(project, chapterId, sectionId);
    const draft = project.sectionDrafts[sectionId];
    if (!draft?.workingDraft || !sameSectionTarget(draft.target, target.reference)) {
      throw new ProjectRepositoryError("SECTION_DRAFT_NOT_FOUND");
    }
    const dependency = resolveSectionDependency(project, chapterId, sectionId);
    if (dependency.mode === "blocking" && dependency.status === "waiting") {
      throw new ProjectRepositoryError("SECTION_DEPENDENCY_UNMET");
    }
    const fingerprint = createDraftFingerprint(toDraftWithRevision(draft.workingDraft), target.reference, dependency.snapshot);
    if (run.projectId !== projectId || run.chapterId !== chapterId || run.sectionId !== sectionId
      || run.sourceDraftRevision !== draft.workingDraft.revision || run.sourceFingerprint !== fingerprint) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }

    const stored = project.sectionReviews[sectionId];
    const previous = stored && sameReviewTarget(stored.target, target.reference) ? stored : createEmptySectionReview(target.reference);
    const issueStates = { ...previous.issueStates };
    const professionalTasks = [...previous.professionalTasks];
    for (const issue of run.issues) {
      const matching = [...previous.runs].reverse().flatMap((item) => item.issues)
        .find((item) => item.issueSignature === issue.issueSignature);
      const previousState = matching ? previous.issueStates[matching.issueId] : undefined;
      const attempts = previousState?.autoRevisionAttemptCount ?? 0;
      const manualRequired = issue.type === "must_fix" && attempts >= 2;
      issueStates[issue.issueId] = {
        issueId: issue.issueId,
        status: manualRequired ? "manual_required" : "open",
        autoRevisionAttemptCount: attempts,
        resolvedAt: null,
        resolutionNote: manualRequired ? "两次 AI 修改后重新校核仍未解决，已转人工处理。" : null,
      };
      if (manualRequired && !professionalTasks.some((task) => task.issueId === issue.issueId || task.issueId === matching?.issueId)) {
        professionalTasks.push({
          taskId: `pt_${randomUUID()}`,
          issueId: issue.issueId,
          title: `人工处理：${issue.problem}`,
          status: "open",
          createdAt: run.createdAt,
        });
      }
    }
    const document: SectionReviewDocument = {
      ...previous,
      runs: [...previous.runs, structuredClone(run)],
      issueStates,
      professionalTasks,
    };
    await this.writeSectionReviewProject({
      ...project,
      updatedAt: run.createdAt,
      sectionDrafts: {
        ...project.sectionDrafts,
        [sectionId]: { ...draft, dependencySnapshot: dependency.snapshot },
      },
      sectionReviews: { ...project.sectionReviews, [sectionId]: document },
    });
    return run;
  }

  async updateReviewIssue(projectId: string, chapterId: string, sectionId: string, issueId: string, input: unknown): Promise<SectionReviewDocument> {
    if (!isReviewIssueUpdateInput(input)) throw new ProjectRepositoryError("SECTION_REVIEW_VALIDATION_FAILED");
    const workspace = await this.getSectionReview(projectId, chapterId, sectionId);
    if (!workspace.review || !workspace.latestRun || !workspace.isLatestReviewCurrent) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }
    const issue = workspace.latestRun.issues.find((item) => item.issueId === issueId);
    if (!issue) throw new ProjectRepositoryError("REVIEW_ISSUE_NOT_FOUND");
    if (issue.type === "must_fix") throw new ProjectRepositoryError("SECTION_REVIEW_BLOCKED");
    if (issue.type === "professional_confirmation" && !input.note.trim()) {
      throw new ProjectRepositoryError("SECTION_REVIEW_VALIDATION_FAILED");
    }
    const now = new Date().toISOString();
    const state: ReviewIssueState = {
      ...workspace.review.issueStates[issueId],
      issueId,
      status: input.decision === "accepted" ? "accepted" : "resolved",
      resolvedAt: now,
      resolutionNote: input.note.trim() || (input.decision === "accepted" ? "已接受该建议。" : "本轮暂不处理。"),
    };
    const document = {
      ...workspace.review,
      issueStates: { ...workspace.review.issueStates, [issueId]: state },
    };
    await this.writeSectionReviewProject({
      ...workspace.project,
      updatedAt: now,
      sectionReviews: { ...workspace.project.sectionReviews, [sectionId]: document },
    });
    return document;
  }

  async saveReviewRevisionSuggestion(
    projectId: string,
    chapterId: string,
    sectionId: string,
    suggestion: ReviewRevisionSuggestion,
  ): Promise<ReviewRevisionSuggestion> {
    const workspace = await this.getSectionReview(projectId, chapterId, sectionId);
    if (!workspace.review || !workspace.latestRun || !workspace.isLatestReviewCurrent || !workspace.draft?.workingDraft) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }
    const issue = workspace.latestRun.issues.find((item) => item.issueId === suggestion.issueId);
    const state = issue ? workspace.review.issueStates[issue.issueId] : undefined;
    if (!issue || !state) throw new ProjectRepositoryError("REVIEW_ISSUE_NOT_FOUND");
    if (state.autoRevisionAttemptCount >= 2 || state.status === "manual_required") {
      throw new ProjectRepositoryError("REVIEW_ISSUE_ATTEMPTS_EXHAUSTED");
    }
    if (suggestion.sourceReviewId !== workspace.latestRun.reviewId
      || suggestion.sourceDraftRevision !== workspace.draft.workingDraft.revision
      || suggestion.sourceFingerprint !== workspace.sourceFingerprint) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }
    const nextState: ReviewIssueState = {
      ...state,
      autoRevisionAttemptCount: state.autoRevisionAttemptCount + 1,
    };
    const document: SectionReviewDocument = {
      ...workspace.review,
      issueStates: { ...workspace.review.issueStates, [issue.issueId]: nextState },
      revisionSuggestions: { ...workspace.review.revisionSuggestions, [issue.issueId]: structuredClone(suggestion) },
    };
    await this.writeSectionReviewProject({
      ...workspace.project,
      updatedAt: suggestion.createdAt,
      sectionReviews: { ...workspace.project.sectionReviews, [sectionId]: document },
    });
    return suggestion;
  }

  async applyReviewRevisionSuggestion(projectId: string, chapterId: string, sectionId: string, issueId: string, input: unknown): Promise<SectionDraftDocument> {
    if (!isReviewRevisionApplyInput(input)) throw new ProjectRepositoryError("SECTION_REVIEW_VALIDATION_FAILED");
    const workspace = await this.getSectionReview(projectId, chapterId, sectionId);
    if (!workspace.review || !workspace.latestRun || !workspace.isLatestReviewCurrent || !workspace.draft?.workingDraft) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }
    const revisionSuggestion = workspace.review.revisionSuggestions[issueId];
    if (!revisionSuggestion) throw new ProjectRepositoryError("REVIEW_REVISION_NOT_FOUND");
    if (input.expectedRevision !== workspace.draft.workingDraft.revision
      || revisionSuggestion.sourceDraftRevision !== workspace.draft.workingDraft.revision
      || revisionSuggestion.sourceFingerprint !== workspace.sourceFingerprint) {
      throw new ProjectRepositoryError("SECTION_DRAFT_CONFLICT");
    }
    const now = new Date().toISOString();
    const content = structuredClone(revisionSuggestion.suggestion.content);
    const workingDraft = {
      ...content,
      revision: workspace.draft.workingDraft.revision + 1,
      basedOnGenerationId: revisionSuggestion.suggestion.generationId,
      updatedAt: now,
    };
    const draft: SectionDraftDocument = {
      ...workspace.draft,
      workingDraft,
      versions: [...workspace.draft.versions, {
        ...content,
        version: workspace.draft.versions.length + 1,
        basedOnWorkingRevision: workingDraft.revision,
        createdAt: now,
        source: "ai_revision_applied",
        generationId: revisionSuggestion.suggestion.generationId,
      }],
    };
    await this.writeSectionReviewProject({
      ...workspace.project,
      updatedAt: now,
      sectionDrafts: { ...workspace.project.sectionDrafts, [sectionId]: draft },
    });
    return draft;
  }

  async confirmReviewedSection(projectId: string, chapterId: string, sectionId: string): Promise<SectionConfirmation> {
    const workspace = await this.getSectionReview(projectId, chapterId, sectionId);
    if (workspace.dependency.status !== "none" && workspace.dependency.status !== "ready") {
      throw new ProjectRepositoryError("SECTION_DEPENDENCY_UNMET");
    }
    if (!workspace.review || !workspace.latestRun || !workspace.isLatestReviewCurrent || !workspace.draft?.workingDraft || !workspace.sourceFingerprint) {
      throw new ProjectRepositoryError("SECTION_REVIEW_STALE");
    }
    const blocking = workspace.latestRun.issues.some((issue) => {
      const state = workspace.review?.issueStates[issue.issueId];
      return issue.type === "must_fix"
        ? state?.status === "open" || state?.status === "manual_required"
        : issue.type === "professional_confirmation" && state?.status === "open";
    });
    if (blocking) throw new ProjectRepositoryError("SECTION_REVIEW_BLOCKED");

    const now = new Date().toISOString();
    const confirmation: SectionConfirmation = {
      confirmationId: `cnf_${randomUUID()}`,
      reviewId: workspace.latestRun.reviewId,
      draftRevision: workspace.draft.workingDraft.revision,
      sourceFingerprint: workspace.sourceFingerprint,
      version: workspace.review.confirmations.length + 1,
      confirmedAt: now,
    };
    const content = toDraftSnapshotContent(workspace.draft.workingDraft);
    const draft: SectionDraftDocument = {
      ...workspace.draft,
      versions: [...workspace.draft.versions, {
        ...content,
        version: workspace.draft.versions.length + 1,
        basedOnWorkingRevision: workspace.draft.workingDraft.revision,
        createdAt: now,
        source: "section_confirmed",
        generationId: workspace.draft.workingDraft.basedOnGenerationId,
      }],
    };
    const review: SectionReviewDocument = {
      ...workspace.review,
      confirmations: [...workspace.review.confirmations, confirmation],
    };
    await this.writeSectionReviewProject({
      ...workspace.project,
      updatedAt: now,
      sectionDrafts: { ...workspace.project.sectionDrafts, [sectionId]: draft },
      sectionReviews: { ...workspace.project.sectionReviews, [sectionId]: review },
    });
    return confirmation;
  }

  private filePathFor(projectId: string): string {
    return path.join(this.itemsDirectory, `${projectId}.json`);
  }

  private generateProjectId(): string {
    return `prj_${randomUUID()}`;
  }

  private async writeProjectDocument(project: ProjectDocument): Promise<void> {
    const validation = validateProjectDocument(project);
    if (!validation.ok) throw new ProjectRepositoryError(validation.error);
    const targetPath = this.filePathFor(project.projectId);
    const temporaryPath = path.join(this.itemsDirectory, `.${project.projectId}.${randomUUID()}.tmp`);
    try {
      await this.fileSystem.writeTempText(temporaryPath, `${JSON.stringify(validation.value, null, 2)}\n`);
      await this.fileSystem.replaceFile(temporaryPath, targetPath);
      const readBack = await this.readProjectFile(targetPath, project.projectId, true);
      if (!readBack.ok) throw new ProjectRepositoryError("PROJECT_WRITE_FAILED");
    } catch (error) {
      await this.fileSystem.removeFile(temporaryPath).catch(() => undefined);
      if (error instanceof ProjectRepositoryError && error.code === "PROJECT_VALIDATION_FAILED") throw error;
      throw new ProjectRepositoryError("PROJECT_WRITE_FAILED");
    }
  }

  private async writeOutlineProject(project: ProjectDocument): Promise<void> {
    try {
      await this.writeProjectDocument(project);
    } catch (error) {
      if (error instanceof ProjectRepositoryError && error.code === "PROJECT_WRITE_FAILED") {
        throw new ProjectRepositoryError("OUTLINE_WRITE_FAILED");
      }
      throw error;
    }
  }

  private async writeSectionDraftProject(project: ProjectDocument): Promise<void> {
    try { await this.writeProjectDocument(project); }
    catch (error) { if (error instanceof ProjectRepositoryError && error.code === "PROJECT_WRITE_FAILED") throw new ProjectRepositoryError("SECTION_DRAFT_WRITE_FAILED"); throw error; }
  }

  private async writeSectionReviewProject(project: ProjectDocument): Promise<void> {
    try {
      await this.writeProjectDocument(project);
    } catch (error) {
      if (error instanceof ProjectRepositoryError && error.code === "PROJECT_WRITE_FAILED") {
        throw new ProjectRepositoryError("SECTION_REVIEW_WRITE_FAILED");
      }
      throw error;
    }
  }

  private async readProjectFile(filePath: string, expectedProjectId: string, isDirectRead = false): Promise<{ ok: true; value: ProjectDocument } | { ok: false; code: ProjectRepositoryErrorCode }> {
    let raw: string;
    try {
      raw = await this.fileSystem.readText(filePath);
    } catch (error) {
      if (isDirectRead && isNotFound(error)) return { ok: false, code: "PROJECT_NOT_FOUND" };
      return { ok: false, code: "PROJECT_READ_FAILED" };
    }
    try {
      const migration = migrateProjectDocument(
        JSON.parse(raw),
        expectedProjectId === "a-village" ? demoMaterials : [],
      );
      if (!migration.ok) {
        return {
          ok: false,
          code: migration.error === "PROJECT_SCHEMA_UNSUPPORTED"
            ? migration.error
            : "PROJECT_READ_FAILED",
        };
      }
      if (migration.value.document.projectId !== expectedProjectId) {
        return { ok: false, code: "PROJECT_READ_FAILED" };
      }
      if (migration.value.migrated) {
        try {
          await this.writeProjectDocument(migration.value.document);
        } catch (error) {
          return {
            ok: false,
            code: error instanceof ProjectRepositoryError ? error.code : "PROJECT_WRITE_FAILED",
          };
        }
      }
      return { ok: true, value: migration.value.document };
    } catch {
      return { ok: false, code: "PROJECT_READ_FAILED" };
    }
  }
}

type WorkingOutlineSaveInput = { expectedRevision: number; content: PlannerOutput };
type ConfirmationInput = { expectedRevision: number };
type SectionDraftSaveInput = { expectedRevision: number; contentMarkdown: string };
type SectionDraftVersionInput = { expectedRevision: number };
type SectionDraftApplyInput = { expectedRevision: number };
type ReviewIssueUpdateInput = { decision: "accepted" | "resolved"; note: string };
type ReviewRevisionApplyInput = { expectedRevision: number };
type SectionDependencyInput = {
  predecessorSectionId: string | null;
  mode: "none" | "reference" | "blocking";
};

function isWorkingOutlineSaveInput(value: unknown): value is WorkingOutlineSaveInput {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 2
    && "expectedRevision" in value && "content" in value
    && Number.isInteger(value.expectedRevision) && typeof value.expectedRevision === "number";
}

function isConfirmationInput(value: unknown): value is ConfirmationInput {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1 && "expectedRevision" in value
    && Number.isInteger(value.expectedRevision) && typeof value.expectedRevision === "number";
}

function isSectionDraftSaveInput(value: unknown): value is SectionDraftSaveInput {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 2
    && "expectedRevision" in value && typeof value.expectedRevision === "number" && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 0
    && "contentMarkdown" in value && typeof value.contentMarkdown === "string" && value.contentMarkdown.length <= 50000;
}

function isSectionDraftVersionInput(value: unknown): value is SectionDraftVersionInput {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1
    && "expectedRevision" in value && typeof value.expectedRevision === "number" && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 1;
}
function isSectionDraftApplyInput(value: unknown): value is SectionDraftApplyInput {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1
    && "expectedRevision" in value && typeof value.expectedRevision === "number"
    && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 0;
}
function isReviewIssueUpdateInput(value: unknown): value is ReviewIssueUpdateInput {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "decision" in value && (value.decision === "accepted" || value.decision === "resolved")
    && "note" in value && typeof value.note === "string" && value.note.length <= 4000;
}
function isReviewRevisionApplyInput(value: unknown): value is ReviewRevisionApplyInput {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "expectedRevision" in value && typeof value.expectedRevision === "number"
    && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 1;
}

function isSectionDependencyInput(value: unknown): value is SectionDependencyInput {
  return typeof value === "object" && value !== null
    && Object.keys(value).length === 2
    && "mode" in value
    && (value.mode === "none" || value.mode === "reference" || value.mode === "blocking")
    && "predecessorSectionId" in value
    && (value.mode === "none"
      ? value.predecessorSectionId === null
      : typeof value.predecessorSectionId === "string"
        && /^[a-z][a-z0-9_-]{1,79}$/i.test(value.predecessorSectionId));
}

function emptyWriterContent(target: SectionDraftDocument["target"]): WriterContent {
  return { chapterNodeId: target.chapterId, sectionNodeId: target.sectionId, sectionTitle: target.sectionTitle, contentMarkdown: "", strategyMapping: [], sourceUsed: [], missingInfo: [], humanConfirmation: [], sectionSummary: "人工草稿，尚无 AI 摘要。" };
}
function toDraftSnapshotContent(draft: NonNullable<SectionDraftDocument["workingDraft"]>): WriterContent {
  return {
    chapterNodeId: draft.chapterNodeId,
    sectionNodeId: draft.sectionNodeId,
    sectionTitle: draft.sectionTitle,
    contentMarkdown: draft.contentMarkdown,
    strategyMapping: draft.strategyMapping,
    sourceUsed: draft.sourceUsed,
    missingInfo: draft.missingInfo,
    humanConfirmation: draft.humanConfirmation,
    sectionSummary: draft.sectionSummary,
  };
}

function toDraftWithRevision(draft: NonNullable<SectionDraftDocument["workingDraft"]>) {
  return { ...toDraftSnapshotContent(draft), revision: draft.revision };
}

function createEmptySectionReview(target: SectionReviewDocument["target"]): SectionReviewDocument {
  return {
    target,
    runs: [],
    issueStates: {},
    revisionSuggestions: {},
    professionalTasks: [],
    confirmations: [],
  };
}

function sameReviewTarget(left: SectionReviewDocument["target"], right: SectionDraftDocument["target"]) {
  return left.confirmedOutlineVersion === right.confirmedOutlineVersion
    && left.chapterId === right.chapterId
    && left.sectionId === right.sectionId;
}

function getConfirmedSectionTarget(project: ProjectDocument, chapterId: string, sectionId: string) {
  const active = project.plannerOutline.activeConfirmedVersion;
  const content = active === null ? null : project.plannerOutline.confirmedVersions.find((version) => version.version === active)?.content;
  const chapter = content?.chapters.find((item) => item.nodeId === chapterId);
  const task = chapter?.sections.find((item) => item.nodeId === sectionId);
  if (!chapter || !task || active === null) throw new ProjectRepositoryError("SECTION_TARGET_NOT_FOUND");
  return { reference: { confirmedOutlineVersion: active, chapterId, sectionId, sectionTitle: task.title }, task };
}
function sameSectionTarget(left: SectionDraftDocument["target"], right: SectionDraftDocument["target"]) {
  return left.confirmedOutlineVersion === right.confirmedOutlineVersion && left.chapterId === right.chapterId && left.sectionId === right.sectionId;
}

function validateWorkingOutlineContent(value: unknown, project: ProjectDocument): PlannerOutput | null {
  const validation = validatePlannerOutput(value);
  if (!validation.ok) return null;
  const materialIds = new Set(project.materials.map((material) => material.materialId));
  const nodes = validation.value.chapters.flatMap((chapter) => [chapter, ...chapter.sections]);
  return nodes.some((node) => node.generationBasis.some((basis) => !materialIds.has(basis.materialId))
    || node.requiredMaterials.some((required) => required.sourceMaterialIds.some((id) => !materialIds.has(id))))
    ? null
    : validation.value;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function toProjectSummary(project: ProjectDocument): ProjectSummary {
  const { projectId, name, projectType, createdAt, updatedAt } = project;
  return { projectId, name, projectType, createdAt, updatedAt };
}

export function getProjectRepository(): ProjectRepository {
  return new ProjectRepository();
}
