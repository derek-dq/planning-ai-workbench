import { describe, expect, it } from "vitest";

import { buildReviewerContext } from "@/server/reviewer/context-builder";
import { buildReviewerRuntimePromptFromSource } from "@/server/reviewer/runtime-prompt";
import { buildWriterContext } from "@/server/writer/context-builder";
import { buildWriterRuntimePromptFromSource } from "@/server/writer/runtime-prompt";
import {
  createDependencyFixtureProject,
  DEPENDENCY_CHAPTER_ID,
  DEPENDENT_SECTION_ID,
  PREDECESSOR_BODY_SENTINEL,
  PREDECESSOR_SECTION_ID,
} from "./test-fixture";
import {
  resolveSectionDependency,
  validateDependencySelection,
} from "./section-dependency";

describe("section dependency", () => {
  it("allows reference dependencies to compile in parallel with provisional context", () => {
    const project = createDependencyFixtureProject({ confirmPredecessor: false });
    const dependency = resolveSectionDependency(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(dependency).toMatchObject({
      status: "provisional",
      mode: "reference",
      predecessor: { sectionId: PREDECESSOR_SECTION_ID },
    });
    expect(buildWriterContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID)).toMatchObject({
      ok: true,
      input: {
        predecessorContext: {
          basis: "provisional",
          sectionId: PREDECESSOR_SECTION_ID,
        },
      },
    });
  });

  it("blocks generation only when a hard dependency has no current confirmation", () => {
    const project = createDependencyFixtureProject({ confirmPredecessor: false });
    project.sectionDependencies[DEPENDENT_SECTION_ID].mode = "blocking";
    const dependency = resolveSectionDependency(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(dependency).toMatchObject({ status: "waiting", mode: "blocking" });
    expect(buildWriterContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID)).toMatchObject({
      ok: false,
      error: "WRITER_DEPENDENCY_UNMET",
    });
  });

  it("unlocks after confirmation and sends only the predecessor summary and necessary facts", () => {
    const project = createDependencyFixtureProject();
    const dependency = resolveSectionDependency(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(dependency.status).toBe("ready");
    const context = buildWriterContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.input.predecessorContext).toMatchObject({
      basis: "confirmed",
      sectionId: PREDECESSOR_SECTION_ID,
      sectionSummary: "A村是本次规划的唯一项目对象，规划期限以任务书为准。",
    });
    const runtime = buildWriterRuntimePromptFromSource("Writer 原始作业要求", context.input);
    expect(runtime.prompt).toContain("basis 为 confirmed 时可作为已确认衔接依据");
    expect(runtime.prompt).not.toContain(PREDECESSOR_BODY_SENTINEL);
  });

  it("marks the downstream section stale after the predecessor confirmation changes", () => {
    const project = createDependencyFixtureProject({ includeDependentDraft: true });
    const confirmation = project.sectionReviews[PREDECESSOR_SECTION_ID].confirmations[0];
    confirmation.confirmationId = "cnf_background_new";
    confirmation.version = 2;
    const dependency = resolveSectionDependency(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(dependency.status).toBe("stale");
    expect(dependency.reason).toContain("需要重新校核");
  });

  it("passes the predecessor context to Reviewer for cross-section consistency review", () => {
    const project = createDependencyFixtureProject({ includeDependentDraft: true });
    const context = buildReviewerContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.input.previousConfirmedSummaries).toEqual(expect.arrayContaining([
      expect.stringContaining("项目背景"),
      expect.stringContaining("A村是本次规划的唯一项目对象"),
    ]));
    const runtime = buildReviewerRuntimePromptFromSource("Reviewer 原始作业要求", context.input);
    expect(runtime.prompt).toContain("项目名称、关键事实、目标、策略和措施");
  });

  it("rejects self-dependencies and dependency cycles", () => {
    const project = createDependencyFixtureProject();
    expect(validateDependencySelection(project, DEPENDENT_SECTION_ID, "reference", DEPENDENT_SECTION_ID)).toBe(false);
    project.sectionDependencies[DEPENDENT_SECTION_ID] = {
      predecessorSectionId: PREDECESSOR_SECTION_ID,
      mode: "reference",
      updatedAt: "2026-07-30T09:00:00.000Z",
    };
    expect(validateDependencySelection(project, PREDECESSOR_SECTION_ID, "reference", DEPENDENT_SECTION_ID)).toBe(false);
    expect(validateDependencySelection(project, DEPENDENT_SECTION_ID, "none", null)).toBe(true);
  });
});
