import { describe, expect, it } from "vitest";

import { demoMaterials } from "@/domain/materials/demo-materials";
import {
  evaluateMaterialReadiness,
  validateMaterialDocument,
  validateMaterialUsageInput,
} from "@/domain/materials/schema";

describe("material schema and readiness", () => {
  it("validates the versioned a-village mock materials", () => {
    expect(demoMaterials).toHaveLength(6);
    for (const material of demoMaterials) {
      expect(validateMaterialDocument(material)).toEqual({ ok: true, value: material });
    }
    expect(new Set(demoMaterials.map((material) => material.materialId)).size).toBe(demoMaterials.length);
  });

  it("allows generation with required materials and marks optional gaps", () => {
    const readiness = evaluateMaterialReadiness(demoMaterials);
    expect(readiness.canGenerate).toBe(true);
    expect(readiness.blockingMissing).toEqual([]);
    expect(readiness.knownMissingMaterials.map((item) => item.category)).toEqual(["evaluation_criteria"]);
    expect(readiness.pendingProfessionalConfirmations).toEqual([
      expect.objectContaining({ materialId: "mat_evaluation" }),
    ]);
  });

  it("blocks generation when project context or deliverable requirements are not adopted", () => {
    const materials = demoMaterials.map((material) => (
      material.category === "project_context"
        ? { ...material, materialUsageStatus: "excluded" as const }
        : material
    ));
    const readiness = evaluateMaterialReadiness(materials);
    expect(readiness.canGenerate).toBe(false);
    expect(readiness.blockingMissing.map((item) => item.category)).toEqual(["project_context"]);
  });

  it("accepts only a single valid usage field", () => {
    expect(validateMaterialUsageInput({ materialUsageStatus: "reference_only" })).toEqual({
      ok: true,
      value: { materialUsageStatus: "reference_only" },
    });
    expect(validateMaterialUsageInput({
      materialUsageStatus: "adopted",
      materialParseStatus: "failed",
    })).toEqual({ ok: false, error: "MATERIAL_VALIDATION_FAILED" });
  });
});
