import {
  MATERIAL_CATEGORIES,
  type MaterialCategory,
} from "@/domain/materials/schema";
import {
  WRITER_TYPES,
  isWriterType,
  type WriterType,
} from "@/domain/writer/writer-types";

export const PLANNER_INPUT_CONTRACT_VERSION = 1 as const;
export const PLANNER_OUTPUT_CONTRACT_VERSION = 1 as const;
export const PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME = "planner_outline_v1";

export type PlannerInputMaterial = {
  materialId: string;
  title: string;
  category: MaterialCategory;
  summary: string;
};

export type PlannerInputGap = {
  category: MaterialCategory;
  title: string;
  reason: string;
};

export type PlannerInputProfessionalConfirmation = {
  materialId: string;
  title: string;
  reason: string;
};

export const PLANNER_UNAVAILABLE_REASON_CODES = [
  "parse_not_ready",
  "version_not_current",
  "usage_pending_review",
  "professional_confirmation_pending",
  "professional_confirmation_rejected",
] as const;

export type PlannerUnavailableReasonCode =
  (typeof PLANNER_UNAVAILABLE_REASON_CODES)[number];

export type PlannerUnavailableMaterialNotice = {
  materialId: string;
  title: string;
  category: MaterialCategory;
  reasons: PlannerUnavailableReasonCode[];
};

export type PlannerInput = {
  contractVersion: typeof PLANNER_INPUT_CONTRACT_VERSION;
  project: {
    projectId: string;
    name: string;
    projectType: string;
  };
  factMaterials: PlannerInputMaterial[];
  referenceMaterials: PlannerInputMaterial[];
  userSupplementalRequirements: string[];
  knownMissingMaterials: PlannerInputGap[];
  pendingProfessionalConfirmations: PlannerInputProfessionalConfirmation[];
  unavailableMaterialNotices: PlannerUnavailableMaterialNotice[];
};

export type PlannerInputValidationResult =
  | { ok: true; value: PlannerInput }
  | { ok: false; error: "PLANNER_INPUT_INVALID" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => keys.includes(key));
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMaterialCategory(value: unknown): value is MaterialCategory {
  return typeof value === "string"
    && MATERIAL_CATEGORIES.includes(value as MaterialCategory);
}

function isInputMaterial(value: unknown): value is PlannerInputMaterial {
  return isRecord(value)
    && hasOnlyKeys(value, ["materialId", "title", "category", "summary"])
    && isNonEmptyText(value.materialId)
    && isNonEmptyText(value.title)
    && isMaterialCategory(value.category)
    && isNonEmptyText(value.summary);
}

function isInputGap(value: unknown): value is PlannerInputGap {
  return isRecord(value)
    && hasOnlyKeys(value, ["category", "title", "reason"])
    && isMaterialCategory(value.category)
    && isNonEmptyText(value.title)
    && isNonEmptyText(value.reason);
}

function isProfessionalConfirmation(
  value: unknown,
): value is PlannerInputProfessionalConfirmation {
  return isRecord(value)
    && hasOnlyKeys(value, ["materialId", "title", "reason"])
    && isNonEmptyText(value.materialId)
    && isNonEmptyText(value.title)
    && isNonEmptyText(value.reason);
}

function isUnavailableReason(
  value: unknown,
): value is PlannerUnavailableReasonCode {
  return typeof value === "string"
    && PLANNER_UNAVAILABLE_REASON_CODES.includes(
      value as PlannerUnavailableReasonCode,
    );
}

function isUnavailableNotice(
  value: unknown,
): value is PlannerUnavailableMaterialNotice {
  return isRecord(value)
    && hasOnlyKeys(value, ["materialId", "title", "category", "reasons"])
    && isNonEmptyText(value.materialId)
    && isNonEmptyText(value.title)
    && isMaterialCategory(value.category)
    && Array.isArray(value.reasons)
    && value.reasons.length > 0
    && value.reasons.every(isUnavailableReason);
}

export function validatePlannerInput(
  value: unknown,
): PlannerInputValidationResult {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, [
      "contractVersion",
      "project",
      "factMaterials",
      "referenceMaterials",
      "userSupplementalRequirements",
      "knownMissingMaterials",
      "pendingProfessionalConfirmations",
      "unavailableMaterialNotices",
    ])
    || value.contractVersion !== PLANNER_INPUT_CONTRACT_VERSION
    || !isRecord(value.project)
    || !hasOnlyKeys(value.project, ["projectId", "name", "projectType"])
    || !isNonEmptyText(value.project.projectId)
    || !isNonEmptyText(value.project.name)
    || !isNonEmptyText(value.project.projectType)
    || !Array.isArray(value.factMaterials)
    || !value.factMaterials.every(isInputMaterial)
    || !Array.isArray(value.referenceMaterials)
    || !value.referenceMaterials.every(isInputMaterial)
    || !Array.isArray(value.userSupplementalRequirements)
    || !value.userSupplementalRequirements.every(isNonEmptyText)
    || !Array.isArray(value.knownMissingMaterials)
    || !value.knownMissingMaterials.every(isInputGap)
    || !Array.isArray(value.pendingProfessionalConfirmations)
    || !value.pendingProfessionalConfirmations.every(isProfessionalConfirmation)
    || !Array.isArray(value.unavailableMaterialNotices)
    || !value.unavailableMaterialNotices.every(isUnavailableNotice)
  ) {
    return { ok: false, error: "PLANNER_INPUT_INVALID" };
  }

  const factIds = new Set(value.factMaterials.map((material) => material.materialId));
  const referenceIds = new Set(
    value.referenceMaterials.map((material) => material.materialId),
  );
  if (
    factIds.size !== value.factMaterials.length
    || referenceIds.size !== value.referenceMaterials.length
    || [...factIds].some((materialId) => referenceIds.has(materialId))
  ) {
    return { ok: false, error: "PLANNER_INPUT_INVALID" };
  }

  return { ok: true, value: value as PlannerInput };
}

const textSchema = { type: "string" } as const;
const textArraySchema = {
  type: "array",
  items: textSchema,
  maxItems: 40,
} as const;
const nodeIdArraySchema = {
  type: "array",
  items: {
    type: "string",
    pattern: "^[a-z][a-z0-9_]{2,79}$",
  },
  maxItems: 24,
} as const;
const requiredMaterialSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "sourceMaterialIds", "reason"],
  properties: {
    name: textSchema,
    sourceMaterialIds: {
      type: "array",
      items: textSchema,
      maxItems: 24,
    },
    reason: textSchema,
  },
} as const;
const generationBasisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["materialId", "reason"],
  properties: {
    materialId: textSchema,
    reason: textSchema,
  },
} as const;
const outlineNodeBaseProperties = {
  nodeId: {
    type: "string",
    pattern: "^[a-z][a-z0-9_]{2,79}$",
  },
  title: textSchema,
  purpose: textSchema,
  keyPoints: textArraySchema,
  requiredMaterials: {
    type: "array",
    items: requiredMaterialSchema,
    maxItems: 24,
  },
  prerequisiteNodeIds: nodeIdArraySchema,
  prerequisiteNotes: textArraySchema,
  estimatedLengthChars: {
    type: "integer",
    minimum: 1,
    maximum: 100000,
  },
  generationBasis: {
    type: "array",
    items: generationBasisSchema,
    maxItems: 24,
  },
} as const;
const outlineNodeBaseRequired = [
  "nodeId",
  "title",
  "purpose",
  "keyPoints",
  "requiredMaterials",
  "prerequisiteNodeIds",
  "prerequisiteNotes",
  "estimatedLengthChars",
  "generationBasis",
] as const;
const sectionSchema = {
  type: "object",
  additionalProperties: false,
  required: [...outlineNodeBaseRequired, "writerType"],
  properties: {
    ...outlineNodeBaseProperties,
    writerType: {
      type: ["string", "null"],
      enum: [...WRITER_TYPES, null],
    },
  },
} as const;
const followUpItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["itemId", "title", "reason", "relatedNodeIds"],
  properties: {
    itemId: {
      type: "string",
      pattern: "^[a-z][a-z0-9_]{2,79}$",
    },
    title: textSchema,
    reason: textSchema,
    relatedNodeIds: nodeIdArraySchema,
  },
} as const;

export const PLANNER_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion",
    "outlineTitle",
    "chapters",
    "missingMaterials",
    "professionalConfirmations",
  ],
  properties: {
    contractVersion: {
      type: "integer",
      enum: [PLANNER_OUTPUT_CONTRACT_VERSION],
    },
    outlineTitle: textSchema,
    chapters: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...outlineNodeBaseRequired, "sections"],
        properties: {
          ...outlineNodeBaseProperties,
          sections: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: sectionSchema,
          },
        },
      },
    },
    missingMaterials: {
      type: "array",
      items: followUpItemSchema,
      maxItems: 80,
    },
    professionalConfirmations: {
      type: "array",
      items: followUpItemSchema,
      maxItems: 80,
    },
  },
} as const;

export type PlannerRequiredMaterial = {
  name: string;
  sourceMaterialIds: string[];
  reason: string;
};

export type PlannerGenerationBasis = {
  materialId: string;
  reason: string;
};

export type PlannerOutlineNodeBase = {
  nodeId: string;
  title: string;
  purpose: string;
  keyPoints: string[];
  requiredMaterials: PlannerRequiredMaterial[];
  prerequisiteNodeIds: string[];
  prerequisiteNotes: string[];
  estimatedLengthChars: number;
  generationBasis: PlannerGenerationBasis[];
};

export type PlannerOutlineNode = PlannerOutlineNodeBase & {
  writerType: WriterType | null;
};

export type PlannerOutlineChapter = PlannerOutlineNodeBase & {
  sections: PlannerOutlineNode[];
};

export type PlannerFollowUpItem = {
  itemId: string;
  title: string;
  reason: string;
  relatedNodeIds: string[];
};

export type PlannerOutput = {
  contractVersion: typeof PLANNER_OUTPUT_CONTRACT_VERSION;
  outlineTitle: string;
  chapters: PlannerOutlineChapter[];
  missingMaterials: PlannerFollowUpItem[];
  professionalConfirmations: PlannerFollowUpItem[];
};

export type PlannerOutputValidationResult =
  | { ok: true; value: PlannerOutput }
  | { ok: false; error: "PLANNER_OUTPUT_INVALID" };

const nodeIdPattern = /^[a-z][a-z0-9_]{2,79}$/;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasOnlyKeys(value, keys);
}

function isTextArray(value: unknown, maxItems = 40): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(isNonEmptyText);
}

function isNodeId(value: unknown): value is string {
  return typeof value === "string" && nodeIdPattern.test(value);
}

function isNodeIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 24 && value.every(isNodeId);
}

function isRequiredMaterial(value: unknown): value is PlannerRequiredMaterial {
  return isRecord(value)
    && hasExactKeys(value, ["name", "sourceMaterialIds", "reason"])
    && isNonEmptyText(value.name)
    && isTextArray(value.sourceMaterialIds, 24)
    && isNonEmptyText(value.reason);
}

function isGenerationBasis(value: unknown): value is PlannerGenerationBasis {
  return isRecord(value)
    && hasExactKeys(value, ["materialId", "reason"])
    && isNonEmptyText(value.materialId)
    && isNonEmptyText(value.reason);
}

const outlineNodeBaseKeys = [
  "nodeId", "title", "purpose", "keyPoints", "requiredMaterials",
  "prerequisiteNodeIds", "prerequisiteNotes", "estimatedLengthChars", "generationBasis",
] as const;

function isOutlineNodeBase(value: Record<string, unknown>): boolean {
  return isNodeId(value.nodeId)
    && isNonEmptyText(value.title)
    && isNonEmptyText(value.purpose)
    && isTextArray(value.keyPoints)
    && Array.isArray(value.requiredMaterials)
    && value.requiredMaterials.length <= 24
    && value.requiredMaterials.every(isRequiredMaterial)
    && isNodeIdArray(value.prerequisiteNodeIds)
    && isTextArray(value.prerequisiteNotes)
    && Number.isInteger(value.estimatedLengthChars)
    && typeof value.estimatedLengthChars === "number"
    && value.estimatedLengthChars >= 1
    && value.estimatedLengthChars <= 100000
    && Array.isArray(value.generationBasis)
    && value.generationBasis.length <= 24
    && value.generationBasis.every(isGenerationBasis);
}

function isOutlineNode(value: unknown, requireWriterType: boolean): value is PlannerOutlineNode {
  const hasWriterType = isRecord(value) && Object.prototype.hasOwnProperty.call(value, "writerType");
  return isRecord(value)
    && hasExactKeys(value, hasWriterType ? [...outlineNodeBaseKeys, "writerType"] : outlineNodeBaseKeys)
    && (!requireWriterType || hasWriterType)
    && (!hasWriterType || value.writerType === null || isWriterType(value.writerType))
    && isOutlineNodeBase(value);
}

function isOutlineChapter(value: unknown, requireWriterType: boolean): value is PlannerOutlineChapter {
  return isRecord(value)
    && hasExactKeys(value, [...outlineNodeBaseKeys, "sections"])
    && isOutlineNodeBase(value)
    && Array.isArray(value.sections)
    && value.sections.length >= 1
    && value.sections.length <= 12
    && value.sections.every((section) => isOutlineNode(section, requireWriterType));
}

function isFollowUpItem(value: unknown): value is PlannerFollowUpItem {
  return isRecord(value)
    && hasExactKeys(value, ["itemId", "title", "reason", "relatedNodeIds"])
    && isNodeId(value.itemId)
    && isNonEmptyText(value.title)
    && isNonEmptyText(value.reason)
    && isNodeIdArray(value.relatedNodeIds);
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function containsCycle(nodes: Map<string, PlannerOutlineNodeBase>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) return true;
    for (const dependency of node.prerequisiteNodeIds) {
      if (visit(dependency)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return [...nodes.keys()].some(visit);
}

export function validatePlannerOutput(
  value: unknown,
  input?: PlannerInput,
  options: { requireWriterType?: boolean } = {},
): PlannerOutputValidationResult {
  const requireWriterType = options.requireWriterType ?? false;
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "contractVersion", "outlineTitle", "chapters", "missingMaterials", "professionalConfirmations",
    ])
    || value.contractVersion !== PLANNER_OUTPUT_CONTRACT_VERSION
    || !isNonEmptyText(value.outlineTitle)
    || !Array.isArray(value.chapters)
    || value.chapters.length < 1
    || value.chapters.length > 12
    || !value.chapters.every((chapter) => isOutlineChapter(chapter, requireWriterType))
    || !Array.isArray(value.missingMaterials)
    || value.missingMaterials.length > 80
    || !value.missingMaterials.every(isFollowUpItem)
    || !Array.isArray(value.professionalConfirmations)
    || value.professionalConfirmations.length > 80
    || !value.professionalConfirmations.every(isFollowUpItem)
  ) {
    return { ok: false, error: "PLANNER_OUTPUT_INVALID" };
  }

  const raw = value as Omit<PlannerOutput, "chapters"> & {
    chapters: Array<Omit<PlannerOutlineChapter, "sections"> & {
      sections: Array<Omit<PlannerOutlineNode, "writerType"> & { writerType?: WriterType | null }>;
    }>;
  };
  const output: PlannerOutput = {
    ...raw,
    chapters: raw.chapters.map((chapter) => ({
      ...chapter,
      sections: chapter.sections.map((section) => ({
        ...section,
        writerType: isWriterType(section.writerType) ? section.writerType : null,
      })),
    })),
  };
  const nodes = output.chapters.flatMap((chapter) => [chapter, ...chapter.sections]);
  const nodeIds = nodes.map((node) => node.nodeId);
  const followUpIds = [
    ...output.missingMaterials.map((item) => item.itemId),
    ...output.professionalConfirmations.map((item) => item.itemId),
  ];
  if (!unique(nodeIds) || !unique(followUpIds)) {
    return { ok: false, error: "PLANNER_OUTPUT_INVALID" };
  }

  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  const unresolvedWriterTypeIds = output.chapters
    .flatMap((chapter) => chapter.sections)
    .filter((section) => section.writerType === null)
    .map((section) => section.nodeId);
  if (
    nodes.some((node) => node.prerequisiteNodeIds.some((id) => id === node.nodeId || !nodeMap.has(id)))
    || containsCycle(nodeMap)
    || [...output.missingMaterials, ...output.professionalConfirmations]
      .some((item) => item.relatedNodeIds.some((id) => !nodeMap.has(id)))
    || (requireWriterType && unresolvedWriterTypeIds.some((nodeId) => !output.professionalConfirmations
      .some((item) => item.relatedNodeIds.includes(nodeId)
        && `${item.title}${item.reason}`.includes("写作类型"))))
  ) {
    return { ok: false, error: "PLANNER_OUTPUT_INVALID" };
  }

  if (input) {
    const allowedMaterialIds = new Set([
      ...input.factMaterials.map((material) => material.materialId),
      ...input.referenceMaterials.map((material) => material.materialId),
    ]);
    if (nodes.some((node) => (
      node.generationBasis.some((basis) => !allowedMaterialIds.has(basis.materialId))
      || node.requiredMaterials.some((required) => required.sourceMaterialIds.some((id) => !allowedMaterialIds.has(id)))
    ))) {
      return { ok: false, error: "PLANNER_OUTPUT_INVALID" };
    }
  }

  return { ok: true, value: output };
}

export type PlannerTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type PlannerSuggestion = {
  generationId: string;
  generationRequestId: string;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  providerResponseId: string | null;
  promptVersion: string;
  promptSource: string;
  parentPromptVersion: string;
  contentHash: string;
  contractVersion: typeof PLANNER_OUTPUT_CONTRACT_VERSION;
  inputFingerprint: string;
  tokenUsage: PlannerTokenUsage;
  latencyMs: number;
  attemptCount: number;
  startedAt: string;
  completedAt: string;
  generatedAt: string;
  content: PlannerOutput;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isNonNegativeIntegerOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

export function validatePlannerSuggestion(value: unknown): value is PlannerSuggestion {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "generationId", "generationRequestId", "provider", "requestedModel", "resolvedModel",
      "providerResponseId", "promptVersion", "promptSource", "parentPromptVersion", "contentHash",
      "contractVersion", "inputFingerprint", "tokenUsage", "latencyMs", "attemptCount", "startedAt",
      "completedAt", "generatedAt", "content",
    ])
    || !isNonEmptyText(value.generationId)
    || !isNonEmptyText(value.generationRequestId)
    || !isNonEmptyText(value.provider)
    || !isNonEmptyText(value.requestedModel)
    || !isNonEmptyText(value.resolvedModel)
    || (value.providerResponseId !== null && !isNonEmptyText(value.providerResponseId))
    || !isNonEmptyText(value.promptVersion)
    || !isNonEmptyText(value.promptSource)
    || !isNonEmptyText(value.parentPromptVersion)
    || typeof value.contentHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.contentHash)
    || value.contractVersion !== PLANNER_OUTPUT_CONTRACT_VERSION
    || typeof value.inputFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(value.inputFingerprint)
    || !isRecord(value.tokenUsage)
    || !hasExactKeys(value.tokenUsage, ["inputTokens", "outputTokens", "totalTokens"])
    || !isNonNegativeIntegerOrNull(value.tokenUsage.inputTokens)
    || !isNonNegativeIntegerOrNull(value.tokenUsage.outputTokens)
    || !isNonNegativeIntegerOrNull(value.tokenUsage.totalTokens)
    || typeof value.latencyMs !== "number"
    || !Number.isInteger(value.latencyMs)
    || value.latencyMs < 0
    || typeof value.attemptCount !== "number"
    || !Number.isInteger(value.attemptCount)
    || value.attemptCount < 1
    || value.attemptCount > 2
    || !isIsoDate(value.startedAt)
    || !isIsoDate(value.completedAt)
    || !isIsoDate(value.generatedAt)
    || Date.parse(value.completedAt) < Date.parse(value.startedAt)
    || value.generatedAt !== value.completedAt
  ) {
    return false;
  }
  return validatePlannerOutput(value.content).ok;
}
