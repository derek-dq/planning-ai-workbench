import { describe, expect, it } from "vitest";

import { demoProject } from "@/domain/projects/demo-project";
import {
  buildPlannerContext,
  createInputFingerprint,
} from "@/server/planner/context-builder";
import { validatePlannerInput } from "@/server/planner/contracts";

describe("Planner Context Builder", () => {
  it("separates current project facts, references, and unavailable notices", () => {
    const result = buildPlannerContext(demoProject);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.input.factMaterials.map((item) => item.materialId)).toEqual([
      "mat_deliverables",
      "mat_meeting_notes",
      "mat_project_context",
      "mat_task_brief",
    ]);
    expect(result.input.referenceMaterials.map((item) => item.materialId)).toEqual([
      "mat_reference_case",
    ]);
    expect(result.input.unavailableMaterialNotices).toEqual([
      {
        materialId: "mat_evaluation",
        title: "评价标准说明",
        category: "evaluation_criteria",
        reasons: [
          "usage_pending_review",
          "professional_confirmation_pending",
        ],
      },
    ]);
    expect(result.input.knownMissingMaterials.map((item) => item.category)).toEqual([
      "evaluation_criteria",
    ]);
    expect(result.input.userSupplementalRequirements).toEqual([
      "用于记录演示项目中已明确的用户补充要求；不包含未确认的专业结论。",
    ]);
    expect(validatePlannerInput(result.input)).toEqual({
      ok: true,
      value: result.input,
    });
  });

  it("never sends excluded material or an unavailable summary", () => {
    const excluded = {
      ...demoProject,
      materials: demoProject.materials.map((material) => (
        material.materialId === "mat_evaluation"
          ? { ...material, materialUsageStatus: "excluded" as const }
          : material
      )),
    };
    const result = buildPlannerContext(excluded);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(JSON.stringify(result.input)).not.toContain("mat_evaluation");
    expect(JSON.stringify(result.input)).not.toContain(
      "用于演示尚待确认采用且涉及专业判断的评价标准资料状态。",
    );
  });

  it("returns no model input when a required material category is missing", () => {
    const blocked = {
      ...demoProject,
      materials: demoProject.materials.map((material) => (
        material.category === "project_context"
          ? { ...material, materialUsageStatus: "reference_only" as const }
          : material
      )),
    };

    expect(buildPlannerContext(blocked)).toEqual({
      ok: false,
      error: "PLANNER_INPUT_INSUFFICIENT",
      blockingMissing: [
        expect.objectContaining({ category: "project_context" }),
      ],
    });
  });

  it("creates a stable fingerprint independent of material array order", () => {
    const original = buildPlannerContext(demoProject);
    const reordered = buildPlannerContext({
      ...demoProject,
      materials: [...demoProject.materials].reverse(),
    });

    expect(original.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!original.ok || !reordered.ok) return;
    expect(reordered.input).toEqual(original.input);
    expect(reordered.inputFingerprint).toBe(original.inputFingerprint);
    expect(createInputFingerprint(original.input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the fingerprint when a model-visible fact changes", () => {
    const original = buildPlannerContext(demoProject);
    const changed = buildPlannerContext({
      ...demoProject,
      materials: demoProject.materials.map((material) => (
        material.materialId === "mat_project_context"
          ? { ...material, summary: `${material.summary} 补充说明。` }
          : material
      )),
    });

    expect(original.ok).toBe(true);
    expect(changed.ok).toBe(true);
    if (!original.ok || !changed.ok) return;
    expect(changed.inputFingerprint).not.toBe(original.inputFingerprint);
  });
});
