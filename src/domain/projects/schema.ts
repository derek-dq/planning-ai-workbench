import { validateMaterialDocument, type MaterialDocument } from "@/domain/materials/schema";
import {
  validatePlannerOutput,
  validatePlannerSuggestion,
  type PlannerOutput,
  type PlannerSuggestion,
} from "@/server/planner/contracts";
import {
  validateWriterContent,
  validateWriterSuggestion,
  type WriterContent,
  type WriterSuggestion,
} from "@/server/writer/contracts";
import {
  validateSectionReviewDocument,
  type SectionReviewDocument,
} from "@/server/reviewer/contracts";

export const PROJECT_SCHEMA_VERSION = 8;
export const OUTLINE_SCHEMA_VERSION = 1;

export type WorkingOutline = {
  revision: number;
  basedOnGenerationId: string | null;
  updatedAt: string;
  content: PlannerOutput;
};

export type ConfirmedOutlineVersion = {
  version: number;
  basedOnWorkingRevision: number;
  basedOnGenerationId: string | null;
  confirmedAt: string;
  content: PlannerOutput;
};

export type PlannerOutlineDocument = {
  outlineSchemaVersion: typeof OUTLINE_SCHEMA_VERSION;
  latestSuggestion: PlannerSuggestion | null;
  workingOutline: WorkingOutline | null;
  confirmedVersions: ConfirmedOutlineVersion[];
  activeConfirmedVersion: number | null;
};

export type SectionDraftDocument = {
  target: { confirmedOutlineVersion: number; chapterId: string; sectionId: string; sectionTitle: string };
  dependencySnapshot: SectionDependencySnapshot | null;
  latestSuggestion: WriterSuggestion | null;
  workingDraft: (WriterContent & { revision: number; basedOnGenerationId: string | null; updatedAt: string }) | null;
  versions: Array<(WriterContent & { version: number; basedOnWorkingRevision: number; createdAt: string; source: "manual_snapshot" | "ai_applied" | "ai_revision_applied" | "section_confirmed"; generationId: string | null })>;
};

export type SectionDependencyConfig = {
  predecessorSectionId: string | null;
  mode: "none" | "reference" | "blocking";
  updatedAt: string;
};

export type SectionDependencySnapshot = {
  predecessorSectionId: string;
  predecessorConfirmationId: string;
  predecessorDraftRevision: number;
  predecessorSectionSummary: string;
  essentialFacts: string[];
  capturedAt: string;
};

export type ProjectDocument = {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  name: string;
  projectType: string;
  createdAt: string;
  updatedAt: string;
  materials: MaterialDocument[];
  plannerOutline: PlannerOutlineDocument;
  sectionDependencies: Record<string, SectionDependencyConfig>;
  sectionDrafts: Record<string, SectionDraftDocument>;
  sectionReviews: Record<string, SectionReviewDocument>;
};

type ProjectDocumentV1 = Omit<ProjectDocument, "schemaVersion" | "materials" | "plannerOutline" | "sectionDependencies" | "sectionDrafts" | "sectionReviews"> & {
  schemaVersion: 1;
};

type ProjectDocumentV2 = Omit<ProjectDocument, "schemaVersion"> & {
  schemaVersion: 2;
};

type ProjectDocumentV3 = Omit<ProjectDocument, "schemaVersion"> & {
  schemaVersion: 3;
};
type ProjectDocumentV4 = Omit<ProjectDocument, "schemaVersion" | "sectionDrafts"> & { schemaVersion: 4 };
type ProjectDocumentV5 = Omit<ProjectDocument, "schemaVersion"> & { schemaVersion: 5 };
type ProjectDocumentV6 = Omit<ProjectDocument, "schemaVersion" | "sectionReviews"> & { schemaVersion: 6 };
type ProjectDocumentV7 = Omit<ProjectDocument, "schemaVersion" | "sectionDependencies"> & {
  schemaVersion: 7;
  sectionDrafts: Record<string, Omit<SectionDraftDocument, "dependencySnapshot">>;
};

export type CreateProjectInput = Pick<ProjectDocument, "name" | "projectType">;
export type EditProjectInput = CreateProjectInput;

export type ProjectValidationError =
  | "PROJECT_VALIDATION_FAILED"
  | "PROJECT_ID_INVALID"
  | "PROJECT_SCHEMA_UNSUPPORTED";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProjectValidationError };

export type ProjectMigrationResult = {
  document: ProjectDocument;
  migrated: boolean;
};

const projectIdPattern = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const outlineNodeIdPattern = /^[a-z][a-z0-9_]{2,79}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= maxLength ? normalized : null;
}

function isUtcIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function createEmptyPlannerOutline(): PlannerOutlineDocument {
  return {
    outlineSchemaVersion: OUTLINE_SCHEMA_VERSION,
    latestSuggestion: null,
    workingOutline: null,
    confirmedVersions: [],
    activeConfirmedVersion: null,
  };
}

export function validateProjectId(value: unknown): ValidationResult<string> {
  return typeof value === "string" && projectIdPattern.test(value)
    ? { ok: true, value }
    : { ok: false, error: "PROJECT_ID_INVALID" };
}

export function validateCreateProjectInput(value: unknown): ValidationResult<CreateProjectInput> {
  if (!isRecord(value)) return { ok: false, error: "PROJECT_VALIDATION_FAILED" };
  const name = normalizeText(value.name, 120);
  const projectType = normalizeText(value.projectType, 80);
  return name && projectType
    ? { ok: true, value: { name, projectType } }
    : { ok: false, error: "PROJECT_VALIDATION_FAILED" };
}

export const validateEditProjectInput = validateCreateProjectInput;

function validateBaseProject(value: Record<string, unknown>): ValidationResult<Omit<ProjectDocumentV1, "schemaVersion">> {
  const projectId = validateProjectId(value.projectId);
  const input = validateCreateProjectInput(value);
  if (!projectId.ok || !input.ok || !isUtcIsoDate(value.createdAt) || !isUtcIsoDate(value.updatedAt)) {
    return { ok: false, error: !projectId.ok ? projectId.error : "PROJECT_VALIDATION_FAILED" };
  }
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
    return { ok: false, error: "PROJECT_VALIDATION_FAILED" };
  }
  return {
    ok: true,
    value: {
      projectId: projectId.value,
      name: input.value.name,
      projectType: input.value.projectType,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  };
}

function validateMaterials(value: unknown): MaterialDocument[] | null {
  if (!Array.isArray(value)) return null;
  const materials: MaterialDocument[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const result = validateMaterialDocument(item);
    if (!result.ok || ids.has(result.value.materialId)) return null;
    ids.add(result.value.materialId);
    materials.push(result.value);
  }
  return materials;
}

function validatePlannerOutline(value: unknown): PlannerOutlineDocument | null {
  if (!isRecord(value) || value.outlineSchemaVersion !== OUTLINE_SCHEMA_VERSION
    || (value.latestSuggestion !== null && !validatePlannerSuggestion(value.latestSuggestion))
    || !Array.isArray(value.confirmedVersions)) {
    return null;
  }

  const workingOutline = validateWorkingOutline(value.workingOutline);
  const confirmedVersions = value.confirmedVersions.map(validateConfirmedOutlineVersion);
  if (workingOutline === undefined || confirmedVersions.some((item) => item === null)) return null;
  const versions = confirmedVersions as ConfirmedOutlineVersion[];
  const expectedVersions = versions.map((item, index) => index + 1);
  const activeConfirmedVersion = value.activeConfirmedVersion;
  if (!sameNumberSequence(versions.map((item) => item.version), expectedVersions)
    || (activeConfirmedVersion !== null && (!isPositiveInteger(activeConfirmedVersion)
      || activeConfirmedVersion < 1 || activeConfirmedVersion > versions.length))
    || (activeConfirmedVersion === null && versions.length > 0)) return null;

  const latestSuggestion = value.latestSuggestion === null
    ? null
    : normalizePlannerSuggestion(value.latestSuggestion);
  if (value.latestSuggestion !== null && latestSuggestion === null) return null;

  return {
    outlineSchemaVersion: OUTLINE_SCHEMA_VERSION,
    latestSuggestion,
    workingOutline,
    confirmedVersions: versions,
    activeConfirmedVersion: activeConfirmedVersion as number | null,
  };
}

function normalizePlannerSuggestion(value: unknown): PlannerSuggestion | null {
  if (!validatePlannerSuggestion(value)) return null;
  const content = validatePlannerOutput(value.content);
  return content.ok ? { ...value, content: content.value } : null;
}

function applyLegacyWriterTypeCompatibility(
  outline: PlannerOutlineDocument,
  rawOutline: unknown,
  sectionDrafts: Record<string, SectionDraftDocument>,
): PlannerOutlineDocument {
  const legacyStrategySectionIds = new Set(Object.entries(sectionDrafts)
    .filter(([, draft]) => draft.latestSuggestion !== null
      || draft.workingDraft !== null
      || draft.versions.length > 0)
    .map(([sectionId]) => sectionId));
  const rawContentSections = (rawContent: unknown): Map<string, Record<string, unknown>> => {
    const sections = new Map<string, Record<string, unknown>>();
    if (!isRecord(rawContent) || !Array.isArray(rawContent.chapters)) return sections;
    for (const chapter of rawContent.chapters) {
      if (!isRecord(chapter) || !Array.isArray(chapter.sections)) continue;
      for (const section of chapter.sections) {
        if (isRecord(section) && typeof section.nodeId === "string") sections.set(section.nodeId, section);
      }
    }
    return sections;
  };
  const mapContent = (content: PlannerOutput, rawContent: unknown): PlannerOutput => {
    const rawSections = rawContentSections(rawContent);
    return {
    ...content,
    chapters: content.chapters.map((chapter) => ({
      ...chapter,
      sections: chapter.sections.map((section) => ({
        ...section,
        writerType: rawSections.get(section.nodeId)
          && Object.prototype.hasOwnProperty.call(rawSections.get(section.nodeId)!, "writerType")
          ? section.writerType
          : legacyStrategySectionIds.has(section.nodeId) ? "strategy_solution" : null,
      })),
    })),
    };
  };
  const raw = isRecord(rawOutline) ? rawOutline : {};
  const rawSuggestionContent = isRecord(raw.latestSuggestion) ? raw.latestSuggestion.content : null;
  const rawWorkingContent = isRecord(raw.workingOutline) ? raw.workingOutline.content : null;
  const rawConfirmedVersions = Array.isArray(raw.confirmedVersions) ? raw.confirmedVersions : [];
  return {
    ...outline,
    latestSuggestion: outline.latestSuggestion
      ? { ...outline.latestSuggestion, content: mapContent(outline.latestSuggestion.content, rawSuggestionContent) }
      : null,
    workingOutline: outline.workingOutline
      ? { ...outline.workingOutline, content: mapContent(outline.workingOutline.content, rawWorkingContent) }
      : null,
    confirmedVersions: outline.confirmedVersions.map((version, index) => ({
      ...version,
      content: mapContent(
        version.content,
        isRecord(rawConfirmedVersions[index]) ? rawConfirmedVersions[index].content : null,
      ),
    })),
  };
}

function validateSectionDrafts(value: unknown): Record<string, SectionDraftDocument> | null {
  if (!isRecord(value)) return null;
  const drafts: Record<string, SectionDraftDocument> = {};
  for (const [sectionId, item] of Object.entries(value)) {
    if (!isRecord(item) || !isRecord(item.target) || !Array.isArray(item.versions)) return null;
    const title = normalizeText(item.target.sectionTitle, 120);
    if (typeof item.target.chapterId !== "string" || item.target.sectionId !== sectionId || !isPositiveInteger(item.target.confirmedOutlineVersion) || !title) return null;
    const latestSuggestion = item.latestSuggestion === null ? null : validateWriterSuggestion(item.latestSuggestion) ? item.latestSuggestion : undefined;
    const working = item.workingDraft === null ? null : validateWorkingSectionDraft(item.workingDraft);
    const versions = item.versions.map(validateSectionDraftVersion);
    if (latestSuggestion === undefined || working === undefined || versions.some((version) => version === null)) return null;
    const validVersions = versions as SectionDraftDocument["versions"];
    if (!sameNumberSequence(validVersions.map((version) => version.version), validVersions.map((_, index) => index + 1))) return null;
    const dependencySnapshot = validateDependencySnapshot(item.dependencySnapshot);
    if (dependencySnapshot === undefined) return null;
    drafts[sectionId] = {
      target: { confirmedOutlineVersion: item.target.confirmedOutlineVersion, chapterId: item.target.chapterId, sectionId, sectionTitle: title },
      dependencySnapshot,
      latestSuggestion,
      workingDraft: working,
      versions: validVersions,
    };
  }
  return drafts;
}

function validateSectionDependencies(value: unknown): Record<string, SectionDependencyConfig> | null {
  if (!isRecord(value)) return null;
  const dependencies: Record<string, SectionDependencyConfig> = {};
  for (const [sectionId, item] of Object.entries(value)) {
    if (!outlineNodeIdPattern.test(sectionId) || !isRecord(item) || !isUtcIsoDate(item.updatedAt)) return null;
    const mode = item.mode === undefined ? "reference" : item.mode;
    if (mode !== "none" && mode !== "reference" && mode !== "blocking") return null;
    const predecessorSectionId = item.predecessorSectionId === null || item.predecessorSectionId === undefined
      ? null
      : String(item.predecessorSectionId);
    if (mode === "none") {
      if (predecessorSectionId !== null) return null;
    } else if (!predecessorSectionId
      || !outlineNodeIdPattern.test(predecessorSectionId)
      || predecessorSectionId === sectionId) return null;
    dependencies[sectionId] = {
      predecessorSectionId,
      mode,
      updatedAt: item.updatedAt,
    };
  }
  return dependencies;
}

function validateDependencySnapshot(value: unknown): SectionDependencySnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)
    || !outlineNodeIdPattern.test(String(value.predecessorSectionId))
    || !normalizeText(value.predecessorConfirmationId, 120)
    || !isPositiveInteger(value.predecessorDraftRevision)
    || !normalizeText(value.predecessorSectionSummary, 4000)
    || !Array.isArray(value.essentialFacts)
    || value.essentialFacts.length > 20
    || value.essentialFacts.some((item) => !normalizeText(item, 2000))
    || !isUtcIsoDate(value.capturedAt)) return undefined;
  return {
    predecessorSectionId: String(value.predecessorSectionId),
    predecessorConfirmationId: String(value.predecessorConfirmationId),
    predecessorDraftRevision: value.predecessorDraftRevision,
    predecessorSectionSummary: String(value.predecessorSectionSummary).trim(),
    essentialFacts: value.essentialFacts.map((item) => String(item).trim()),
    capturedAt: value.capturedAt,
  };
}

function validateWorkingSectionDraft(value: unknown): SectionDraftDocument["workingDraft"] | undefined {
  if (!isRecord(value) || !isPositiveInteger(value.revision) || !isNullableGenerationId(value.basedOnGenerationId) || !isUtcIsoDate(value.updatedAt)) return undefined;
  const content = validateWriterContent(value);
  return content.ok ? { ...content.value, revision: value.revision, basedOnGenerationId: value.basedOnGenerationId, updatedAt: value.updatedAt } : undefined;
}

function validateSectionDraftVersion(value: unknown): SectionDraftDocument["versions"][number] | null {
  if (!isRecord(value) || !isPositiveInteger(value.version) || !isPositiveInteger(value.basedOnWorkingRevision)
    || !["manual_snapshot", "ai_applied", "ai_revision_applied", "section_confirmed"].includes(value.source as string)
    || !isNullableGenerationId(value.generationId) || !isUtcIsoDate(value.createdAt)) return null;
  const content = validateWriterContent(value);
  return content.ok ? {
    ...content.value,
    version: value.version,
    basedOnWorkingRevision: value.basedOnWorkingRevision,
    createdAt: value.createdAt,
    source: value.source as SectionDraftDocument["versions"][number]["source"],
    generationId: value.generationId,
  } : null;
}

function validateSectionReviews(value: unknown): Record<string, SectionReviewDocument> | null {
  if (!isRecord(value)) return null;
  const reviews: Record<string, SectionReviewDocument> = {};
  for (const [sectionId, document] of Object.entries(value)) {
    if (!validateSectionReviewDocument(document, sectionId)) return null;
    reviews[sectionId] = document;
  }
  return reviews;
}

function validateWorkingOutline(value: unknown): WorkingOutline | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isPositiveInteger(value.revision)
    || !isNullableGenerationId(value.basedOnGenerationId)
    || !isUtcIsoDate(value.updatedAt)) return undefined;
  const content = validatePlannerOutput(value.content);
  return content.ok ? {
    revision: value.revision,
    basedOnGenerationId: value.basedOnGenerationId,
    updatedAt: value.updatedAt,
    content: content.value,
  } : undefined;
}

function validateConfirmedOutlineVersion(value: unknown): ConfirmedOutlineVersion | null {
  if (!isRecord(value) || !isPositiveInteger(value.version)
    || !isPositiveInteger(value.basedOnWorkingRevision)
    || !isNullableGenerationId(value.basedOnGenerationId)
    || !isUtcIsoDate(value.confirmedAt)) return null;
  const content = validatePlannerOutput(value.content);
  return content.ok ? {
    version: value.version,
    basedOnWorkingRevision: value.basedOnWorkingRevision,
    basedOnGenerationId: value.basedOnGenerationId,
    confirmedAt: value.confirmedAt,
    content: content.value,
  } : null;
}

function sameNumberSequence(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNullableGenerationId(value: unknown): value is string | null {
  return value === null || normalizeText(value, 120) !== null;
}

export function validateProjectDocument(value: unknown): ValidationResult<ProjectDocument> {
  if (!isRecord(value)) return { ok: false, error: "PROJECT_VALIDATION_FAILED" };
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return { ok: false, error: "PROJECT_SCHEMA_UNSUPPORTED" };
  }
  const base = validateBaseProject(value);
  const materials = validateMaterials(value.materials);
  const plannerOutline = validatePlannerOutline(value.plannerOutline);
  const sectionDependencies = validateSectionDependencies(value.sectionDependencies);
  const sectionDrafts = validateSectionDrafts(value.sectionDrafts);
  const sectionReviews = validateSectionReviews(value.sectionReviews);
  if (!base.ok || !materials || !plannerOutline || !sectionDependencies || !sectionDrafts || !sectionReviews) {
    return { ok: false, error: base.ok ? "PROJECT_VALIDATION_FAILED" : base.error };
  }
  const compatiblePlannerOutline = applyLegacyWriterTypeCompatibility(
    plannerOutline,
    value.plannerOutline,
    sectionDrafts,
  );
  return {
    ok: true,
    value: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      ...base.value,
      materials,
      plannerOutline: compatiblePlannerOutline,
      sectionDependencies,
      sectionDrafts,
      sectionReviews,
    },
  };
}

export function migrateProjectDocument(
  value: unknown,
  seedMaterials: MaterialDocument[] = [],
): ValidationResult<ProjectMigrationResult> {
  if (!isRecord(value)) return { ok: false, error: "PROJECT_VALIDATION_FAILED" };
  if (value.schemaVersion === PROJECT_SCHEMA_VERSION) {
    const current = validateProjectDocument(value);
    return current.ok
      ? { ok: true, value: { document: current.value, migrated: false } }
      : current;
  }
  if (value.schemaVersion === 7) {
    const legacy = value as ProjectDocumentV7;
    const sectionDrafts = Object.fromEntries(Object.entries(legacy.sectionDrafts)
      .map(([sectionId, draft]) => [sectionId, { ...draft, dependencySnapshot: null }]));
    const migrated = validateProjectDocument({
      ...legacy,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      sectionDependencies: {},
      sectionDrafts,
    });
    return migrated.ok ? { ok: true, value: { document: migrated.value, migrated: true } } : migrated;
  }
  if (value.schemaVersion === 6) {
    const legacy = value as ProjectDocumentV6;
    const sectionDrafts = Object.fromEntries(Object.entries(legacy.sectionDrafts)
      .map(([sectionId, draft]) => [sectionId, { ...draft, dependencySnapshot: null }]));
    const migrated = validateProjectDocument({
      ...legacy,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      sectionDependencies: {},
      sectionDrafts,
      sectionReviews: {},
    });
    return migrated.ok ? { ok: true, value: { document: migrated.value, migrated: true } } : migrated;
  }
  if (value.schemaVersion === 4) {
    const migrated = validateProjectDocument({ ...(value as ProjectDocumentV4), schemaVersion: PROJECT_SCHEMA_VERSION, sectionDependencies: {}, sectionDrafts: {}, sectionReviews: {} });
    return migrated.ok ? { ok: true, value: { document: migrated.value, migrated: true } } : migrated;
  }
  if (value.schemaVersion === 5) {
    const legacy = value as ProjectDocumentV5;
    const sectionDrafts = Object.fromEntries(Object.entries(legacy.sectionDrafts).map(([sectionId, draft]) => [sectionId, {
      ...draft,
      dependencySnapshot: null,
      latestSuggestion: null,
      workingDraft: draft.workingDraft === null ? null : {
        ...draft.workingDraft,
        basedOnGenerationId: null,
        chapterNodeId: draft.target.chapterId,
        sectionNodeId: draft.target.sectionId,
        sectionTitle: draft.target.sectionTitle,
        strategyMapping: [], sourceUsed: [], missingInfo: [], humanConfirmation: [], sectionSummary: "人工草稿，尚无 AI 摘要。",
      },
      versions: draft.versions.map((version) => ({
        ...version,
        generationId: null,
        chapterNodeId: draft.target.chapterId,
        sectionNodeId: draft.target.sectionId,
        sectionTitle: draft.target.sectionTitle,
        strategyMapping: [], sourceUsed: [], missingInfo: [], humanConfirmation: [], sectionSummary: "人工快照，尚无 AI 摘要。",
      })),
    }]));
    const migrated = validateProjectDocument({ ...legacy, schemaVersion: PROJECT_SCHEMA_VERSION, sectionDependencies: {}, sectionDrafts, sectionReviews: {} });
    return migrated.ok ? { ok: true, value: { document: migrated.value, migrated: true } } : migrated;
  }
  if (value.schemaVersion === 3 || value.schemaVersion === 2) {
    const legacy = value as ProjectDocumentV2 | ProjectDocumentV3;
    const migrated = validateProjectDocument({ ...legacy, schemaVersion: PROJECT_SCHEMA_VERSION, sectionDependencies: {}, sectionDrafts: {}, sectionReviews: {} });
    return migrated.ok
      ? { ok: true, value: { document: migrated.value, migrated: true } }
      : migrated;
  }
  if (value.schemaVersion !== 1) return { ok: false, error: "PROJECT_SCHEMA_UNSUPPORTED" };
  const base = validateBaseProject(value);
  if (!base.ok) return base;
  const migrated = validateProjectDocument({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ...base.value,
    materials: seedMaterials,
    plannerOutline: createEmptyPlannerOutline(),
    sectionDependencies: {},
    sectionDrafts: {},
    sectionReviews: {},
  });
  return migrated.ok
    ? { ok: true, value: { document: migrated.value, migrated: true } }
    : migrated;
}
