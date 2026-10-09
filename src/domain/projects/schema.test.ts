import { describe, expect, it } from "vitest";

import { demoMaterials } from "@/domain/materials/demo-materials";
import { demoProject } from "@/domain/projects/demo-project";
import {
  migrateProjectDocument,
  PROJECT_SCHEMA_VERSION,
  validateCreateProjectInput,
  validateProjectDocument,
  validateProjectId,
} from "@/domain/projects/schema";

describe("project schema", () => {
  it("validates and normalizes the v4 project document", () => {
    expect(validateProjectDocument({ ...demoProject, name: "  南桥街道A村典型村规划设计  " })).toEqual({
      ok: true,
      value: demoProject,
    });
  });

  it("migrates a v1 demo project and seeds only the supplied materials", () => {
    const legacy = {
      schemaVersion: 1,
      projectId: demoProject.projectId,
      name: demoProject.name,
      projectType: demoProject.projectType,
      createdAt: demoProject.createdAt,
      updatedAt: demoProject.updatedAt,
    };
    const result = migrateProjectDocument(legacy, demoMaterials);
    expect(result).toEqual({
      ok: true,
      value: {
        migrated: true,
        document: demoProject,
      },
    });
    const ordinary = migrateProjectDocument({ ...legacy, projectId: "ordinary-project" });
    expect(ordinary.ok && ordinary.value.document.materials).toEqual([]);
  });

  it("migrates existing v2 and v3 projects without altering their empty outline state", () => {
    const v2 = { ...demoProject, schemaVersion: 2 as const };
    const result = migrateProjectDocument(v2);
    expect(result).toEqual({
      ok: true,
      value: { migrated: true, document: demoProject },
    });
    const v3 = { ...demoProject, schemaVersion: 3 as const };
    expect(migrateProjectDocument(v3)).toEqual({
      ok: true,
      value: { migrated: true, document: demoProject },
    });
  });

  it("migrates v7 projects with an empty dependency map and draft dependency snapshots", () => {
    const legacy: Record<string, unknown> = structuredClone(demoProject);
    delete legacy.sectionDependencies;
    const result = migrateProjectDocument({ ...legacy, schemaVersion: 7 });
    expect(result).toEqual({
      ok: true,
      value: { migrated: true, document: demoProject },
    });
  });

  it("normalizes legacy dependency entries to reference mode", () => {
    const legacy = {
      ...structuredClone(demoProject),
      sectionDependencies: {
        sec_scope: {
          predecessorSectionId: "sec_background",
          updatedAt: "2026-07-30T09:00:00.000Z",
        },
      },
    };
    expect(validateProjectDocument(legacy)).toMatchObject({
      ok: true,
      value: {
        sectionDependencies: {
          sec_scope: {
            predecessorSectionId: "sec_background",
            mode: "reference",
          },
        },
      },
    });
  });

  it("rejects invalid identifiers, materials and unsupported schema versions", () => {
    expect(validateProjectId("../outside")).toEqual({ ok: false, error: "PROJECT_ID_INVALID" });
    expect(validateProjectDocument({ ...demoProject, schemaVersion: PROJECT_SCHEMA_VERSION + 1 })).toEqual({
      ok: false,
      error: "PROJECT_SCHEMA_UNSUPPORTED",
    });
    expect(validateProjectDocument({
      ...demoProject,
      materials: [demoProject.materials[0], demoProject.materials[0]],
    })).toEqual({ ok: false, error: "PROJECT_VALIDATION_FAILED" });
  });

  it("requires a normalized project name and type", () => {
    expect(validateCreateProjectInput({ name: "  ", projectType: "规划" })).toEqual({
      ok: false,
      error: "PROJECT_VALIDATION_FAILED",
    });
  });
});
