import { createHash } from "node:crypto";

import {
  evaluateMaterialReadiness,
  type MaterialDocument,
  type MaterialParseStatus,
  type MaterialVersionStatus,
  type ProfessionalConfirmationStatus,
} from "@/domain/materials/schema";
import type { ProjectDocument } from "@/domain/projects/schema";
import {
  PLANNER_INPUT_CONTRACT_VERSION,
  validatePlannerInput,
  type PlannerInput,
  type PlannerInputMaterial,
  type PlannerUnavailableReasonCode,
} from "@/server/planner/contracts";

export type PlannerContextBuildResult =
  | {
    ok: true;
    input: PlannerInput;
    inputFingerprint: string;
  }
  | {
    ok: false;
    error: "PLANNER_INPUT_INSUFFICIENT";
    blockingMissing: ReturnType<
      typeof evaluateMaterialReadiness
    >["blockingMissing"];
  };

function isProfessionallyUsable(material: MaterialDocument): boolean {
  return material.professionalConfirmationStatus === "not_required"
    || material.professionalConfirmationStatus === "confirmed";
}

function isCurrentAndParsed(material: MaterialDocument): boolean {
  return material.materialParseStatus === "parsed"
    && material.materialVersionStatus === "current";
}

function toInputMaterial(material: MaterialDocument): PlannerInputMaterial {
  return {
    materialId: material.materialId,
    title: material.title,
    category: material.category,
    summary: material.summary,
  };
}

function parseReason(
  status: MaterialParseStatus,
): PlannerUnavailableReasonCode[] {
  return status === "parsed" ? [] : ["parse_not_ready"];
}

function versionReason(
  status: MaterialVersionStatus,
): PlannerUnavailableReasonCode[] {
  return status === "current" ? [] : ["version_not_current"];
}

function professionalReason(
  status: ProfessionalConfirmationStatus,
): PlannerUnavailableReasonCode[] {
  if (status === "pending") return ["professional_confirmation_pending"];
  if (status === "rejected") return ["professional_confirmation_rejected"];
  return [];
}

function unavailableReasons(
  material: MaterialDocument,
): PlannerUnavailableReasonCode[] {
  return [
    ...parseReason(material.materialParseStatus),
    ...versionReason(material.materialVersionStatus),
    ...(material.materialUsageStatus === "pending_review"
      ? ["usage_pending_review" as const]
      : []),
    ...professionalReason(material.professionalConfirmationStatus),
  ];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function createInputFingerprint(input: PlannerInput): string {
  return createHash("sha256")
    .update(stableStringify(input), "utf8")
    .digest("hex");
}

export function buildPlannerContext(
  project: ProjectDocument,
): PlannerContextBuildResult {
  const readiness = evaluateMaterialReadiness(project.materials);
  if (!readiness.canGenerate) {
    return {
      ok: false,
      error: "PLANNER_INPUT_INSUFFICIENT",
      blockingMissing: readiness.blockingMissing,
    };
  }

  const factMaterials: PlannerInputMaterial[] = [];
  const referenceMaterials: PlannerInputMaterial[] = [];
  const unavailableMaterialNotices: PlannerInput["unavailableMaterialNotices"] = [];

  for (const material of [...project.materials].sort((left, right) => (
    left.materialId.localeCompare(right.materialId)
  ))) {
    if (material.materialUsageStatus === "excluded") continue;

    const usable = isCurrentAndParsed(material)
      && isProfessionallyUsable(material);
    const isReference = material.materialUsageStatus === "reference_only"
      || material.category === "reference_template";

    if (usable && isReference) {
      referenceMaterials.push(toInputMaterial(material));
      continue;
    }
    if (usable && material.materialUsageStatus === "adopted") {
      factMaterials.push(toInputMaterial(material));
      continue;
    }

    const reasons = unavailableReasons(material);
    if (reasons.length > 0) {
      unavailableMaterialNotices.push({
        materialId: material.materialId,
        title: material.title,
        category: material.category,
        reasons,
      });
    }
  }

  const input: PlannerInput = {
    contractVersion: PLANNER_INPUT_CONTRACT_VERSION,
    project: {
      projectId: project.projectId,
      name: project.name,
      projectType: project.projectType,
    },
    factMaterials,
    referenceMaterials,
    userSupplementalRequirements: factMaterials
      .filter((material) => material.category === "user_requirements")
      .map((material) => material.summary),
    knownMissingMaterials: [...readiness.knownMissingMaterials].sort(
      (left, right) => left.category.localeCompare(right.category),
    ),
    pendingProfessionalConfirmations: readiness.pendingProfessionalConfirmations
      .filter((item) => project.materials.some((material) => (
        material.materialId === item.materialId
        && material.materialUsageStatus !== "excluded"
      )))
      .sort((left, right) => left.materialId.localeCompare(right.materialId)),
    unavailableMaterialNotices,
  };

  const validation = validatePlannerInput(input);
  if (!validation.ok) {
    throw new Error("Context Builder produced an invalid Planner input.");
  }

  return {
    ok: true,
    input: validation.value,
    inputFingerprint: createInputFingerprint(validation.value),
  };
}
