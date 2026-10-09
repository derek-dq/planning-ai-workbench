export const MATERIAL_CATEGORIES = [
  "project_context",
  "deliverable_requirements",
  "task_requirements",
  "evaluation_criteria",
  "user_requirements",
  "reference_template",
] as const;
export const MATERIAL_SOURCE_KINDS = ["mock", "redacted_case"] as const;

export const MATERIAL_PARSE_STATUSES = ["uploaded", "parsing", "parsed", "failed"] as const;
export const MATERIAL_VERSION_STATUSES = ["current", "superseded", "conflict", "unknown"] as const;
export const MATERIAL_USAGE_STATUSES = ["adopted", "reference_only", "pending_review", "excluded"] as const;
export const PROFESSIONAL_CONFIRMATION_STATUSES = ["not_required", "pending", "confirmed", "rejected"] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];
export type MaterialSourceKind = (typeof MATERIAL_SOURCE_KINDS)[number];
export type MaterialParseStatus = (typeof MATERIAL_PARSE_STATUSES)[number];
export type MaterialVersionStatus = (typeof MATERIAL_VERSION_STATUSES)[number];
export type MaterialUsageStatus = (typeof MATERIAL_USAGE_STATUSES)[number];
export type ProfessionalConfirmationStatus = (typeof PROFESSIONAL_CONFIRMATION_STATUSES)[number];

export type MaterialDocument = {
  materialId: string;
  title: string;
  category: MaterialCategory;
  sourceKind: MaterialSourceKind;
  summary: string;
  materialParseStatus: MaterialParseStatus;
  materialVersionStatus: MaterialVersionStatus;
  materialUsageStatus: MaterialUsageStatus;
  professionalConfirmationStatus: ProfessionalConfirmationStatus;
  updatedAt: string;
};

export type MaterialGap = {
  category: MaterialCategory;
  title: string;
  reason: string;
};

export type PendingProfessionalConfirmation = {
  materialId: string;
  title: string;
  reason: string;
};

export type MaterialReadiness = {
  canGenerate: boolean;
  blockingMissing: MaterialGap[];
  knownMissingMaterials: MaterialGap[];
  pendingProfessionalConfirmations: PendingProfessionalConfirmation[];
};

export type MaterialValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "MATERIAL_VALIDATION_FAILED" };

const materialIdPattern = /^mat_[a-z0-9_]{3,60}$/;

const categoryLabels: Record<MaterialCategory, string> = {
  project_context: "项目背景",
  deliverable_requirements: "成果要求",
  task_requirements: "任务要求",
  evaluation_criteria: "评价标准",
  user_requirements: "用户补充要求",
  reference_template: "参考模板",
};

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

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function validateMaterialDocument(value: unknown): MaterialValidationResult<MaterialDocument> {
  if (!isRecord(value)) return { ok: false, error: "MATERIAL_VALIDATION_FAILED" };
  const title = normalizeText(value.title, 120);
  const summary = normalizeText(value.summary, 4000);
  if (
    typeof value.materialId !== "string"
    || !materialIdPattern.test(value.materialId)
    || !title
    || !summary
    || !includesValue(MATERIAL_CATEGORIES, value.category)
    || !includesValue(MATERIAL_SOURCE_KINDS, value.sourceKind)
    || !includesValue(MATERIAL_PARSE_STATUSES, value.materialParseStatus)
    || !includesValue(MATERIAL_VERSION_STATUSES, value.materialVersionStatus)
    || !includesValue(MATERIAL_USAGE_STATUSES, value.materialUsageStatus)
    || !includesValue(PROFESSIONAL_CONFIRMATION_STATUSES, value.professionalConfirmationStatus)
    || !isUtcIsoDate(value.updatedAt)
  ) {
    return { ok: false, error: "MATERIAL_VALIDATION_FAILED" };
  }
  return {
    ok: true,
    value: {
      materialId: value.materialId,
      title,
      category: value.category,
      sourceKind: value.sourceKind,
      summary,
      materialParseStatus: value.materialParseStatus,
      materialVersionStatus: value.materialVersionStatus,
      materialUsageStatus: value.materialUsageStatus,
      professionalConfirmationStatus: value.professionalConfirmationStatus,
      updatedAt: value.updatedAt,
    },
  };
}

export function validateMaterialUsageInput(value: unknown): MaterialValidationResult<{ materialUsageStatus: MaterialUsageStatus }> {
  if (
    !isRecord(value)
    || Object.keys(value).length !== 1
    || !includesValue(MATERIAL_USAGE_STATUSES, value.materialUsageStatus)
  ) {
    return { ok: false, error: "MATERIAL_VALIDATION_FAILED" };
  }
  return { ok: true, value: { materialUsageStatus: value.materialUsageStatus } };
}

function isProfessionallyUsable(material: MaterialDocument): boolean {
  return material.professionalConfirmationStatus === "not_required"
    || material.professionalConfirmationStatus === "confirmed";
}

function isCurrentParsed(material: MaterialDocument): boolean {
  return material.materialParseStatus === "parsed" && material.materialVersionStatus === "current";
}

function isQualifiedFact(material: MaterialDocument): boolean {
  return isCurrentParsed(material)
    && material.materialUsageStatus === "adopted"
    && isProfessionallyUsable(material);
}

function isQualifiedReference(material: MaterialDocument): boolean {
  return isCurrentParsed(material)
    && (material.materialUsageStatus === "reference_only" || material.materialUsageStatus === "adopted")
    && isProfessionallyUsable(material);
}

function missingGap(category: MaterialCategory, blocking: boolean): MaterialGap {
  return {
    category,
    title: categoryLabels[category],
    reason: blocking
      ? `缺少可采用的${categoryLabels[category]}，暂不能生成方案结构。`
      : `当前没有可采用的${categoryLabels[category]}，生成后需作为待补充资料处理。`,
  };
}

export function evaluateMaterialReadiness(materials: MaterialDocument[]): MaterialReadiness {
  const hasQualified = (category: MaterialCategory) => materials.some((material) => (
    material.category === category
    && (category === "reference_template" ? isQualifiedReference(material) : isQualifiedFact(material))
  ));

  const blockingCategories: MaterialCategory[] = ["project_context", "deliverable_requirements"];
  const optionalCategories: MaterialCategory[] = [
    "task_requirements",
    "evaluation_criteria",
    "user_requirements",
    "reference_template",
  ];
  const blockingMissing = blockingCategories
    .filter((category) => !hasQualified(category))
    .map((category) => missingGap(category, true));
  const knownMissingMaterials = optionalCategories
    .filter((category) => !hasQualified(category))
    .map((category) => missingGap(category, false));
  const pendingProfessionalConfirmations = materials
    .filter((material) => material.professionalConfirmationStatus === "pending")
    .map((material) => ({
      materialId: material.materialId,
      title: material.title,
      reason: "该资料涉及专业判断，确认前不能作为当前项目事实。",
    }));

  return {
    canGenerate: blockingMissing.length === 0,
    blockingMissing,
    knownMissingMaterials,
    pendingProfessionalConfirmations,
  };
}
