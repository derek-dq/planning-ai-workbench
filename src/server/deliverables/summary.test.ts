import { describe, expect, it } from "vitest";

import {
  createDependencyFixtureProject,
  DEPENDENCY_CHAPTER_ID,
  DEPENDENT_SECTION_ID,
  PREDECESSOR_SECTION_ID,
} from "@/server/dependencies/test-fixture";
import { buildDeliverablesSummary } from "./summary";

describe("deliverables summary", () => {
  it("keeps reference dependencies available for parallel authoring", () => {
    const summary = buildDeliverablesSummary(createDependencyFixtureProject({ confirmPredecessor: false }));
    const section = summary.sections.find((item) => item.sectionId === DEPENDENT_SECTION_ID);
    expect(section?.status).toBe("not_started");
    expect(section?.detail).toContain("可并行编制");
    expect(summary.exportableSections).toEqual([]);
  });

  it("shows a hard dependency as waiting while the predecessor is unconfirmed", () => {
    const project = createDependencyFixtureProject({ confirmPredecessor: false });
    project.sectionDependencies[DEPENDENT_SECTION_ID].mode = "blocking";
    const summary = buildDeliverablesSummary(project);
    expect(summary.sections.find((item) => item.sectionId === DEPENDENT_SECTION_ID)?.status).toBe("waiting");
  });

  it("only selects current confirmed snapshots for export", () => {
    const summary = buildDeliverablesSummary(createDependencyFixtureProject());
    expect(summary.sections.find((item) => item.sectionId === PREDECESSOR_SECTION_ID)?.status).toBe("confirmed");
    expect(summary.sections.find((item) => item.sectionId === DEPENDENT_SECTION_ID)?.status).toBe("not_started");
    expect(summary.exportableSections).toEqual([
      expect.objectContaining({
        chapterId: DEPENDENCY_CHAPTER_ID,
        sectionId: PREDECESSOR_SECTION_ID,
        confirmationVersion: 1,
      }),
    ]);
  });

  it("includes two independently confirmed sections without mixing unconfirmed drafts", () => {
    const project = createDependencyFixtureProject({ confirmDependent: true });
    const summary = buildDeliverablesSummary(project);
    expect(summary.exportableSections.map((item) => item.sectionId)).toEqual([
      PREDECESSOR_SECTION_ID,
      DEPENDENT_SECTION_ID,
    ]);
    expect(summary.exportableSections[1].contentMarkdown).toContain("规划范围覆盖A村行政边界");
    expect(summary.wordExportAvailable).toBe(false);
  });

  it("removes a section from export when its draft or dependency has changed after confirmation", () => {
    const project = createDependencyFixtureProject({ confirmDependent: true });
    project.sectionDrafts[PREDECESSOR_SECTION_ID].workingDraft!.revision = 2;
    const summary = buildDeliverablesSummary(project);
    expect(summary.exportableSections).toEqual([]);
    expect(summary.sections.find((item) => item.sectionId === PREDECESSOR_SECTION_ID)?.status).toBe("in_progress");
    expect(summary.sections.find((item) => item.sectionId === DEPENDENT_SECTION_ID)?.status).toBe("in_progress");
  });
});
