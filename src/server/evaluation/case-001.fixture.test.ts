import { describe, expect, it } from "vitest";

import { validateProjectDocument } from "@/domain/projects/schema";
import { CASE_001_PROJECT_ID, createCase001Project } from "@/server/evaluation/case-001.fixture";

describe("Case-001 redacted fixture", () => {
  it("contains only a schema-valid redacted material package", () => {
    const project = createCase001Project();
    expect(project.projectId).toBe(CASE_001_PROJECT_ID);
    expect(project.materials).toHaveLength(5);
    expect(project.materials.every((material) => material.sourceKind === "redacted_case")).toBe(true);
    expect(validateProjectDocument(project).ok).toBe(true);
  });
});
