import { demoMaterials } from "@/domain/materials/demo-materials";
import {
  createEmptyPlannerOutline,
  PROJECT_SCHEMA_VERSION,
  type ProjectDocument,
} from "@/domain/projects/schema";

export const demoProject: ProjectDocument = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  projectId: "a-village",
  name: "南桥街道A村典型村规划设计",
  projectType: "典型村总体发展规划",
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T09:00:00.000Z",
  materials: demoMaterials,
  plannerOutline: createEmptyPlannerOutline(),
  sectionDependencies: {},
  sectionDrafts: {},
  sectionReviews: {},
};
