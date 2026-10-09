import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildReviewerContext } from "@/server/reviewer/context-builder";
import { buildReviewerRuntimePromptFromSource } from "@/server/reviewer/runtime-prompt";
import {
  createReviewerFixtureProject,
  REVIEWER_TEST_CHAPTER_ID,
  REVIEWER_TEST_SECTION_ID,
} from "@/server/reviewer/test-fixture";

describe("Reviewer context and prompt", () => {
  it("reads only the active confirmed target and saved working draft", () => {
    const result = buildReviewerContext(createReviewerFixtureProject(), REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(result.ok && result.input).toMatchObject({
      activeConfirmedVersion: 1,
      target: { chapterId: REVIEWER_TEST_CHAPTER_ID, sectionId: REVIEWER_TEST_SECTION_ID },
      savedDraft: { revision: 1 },
    });
  });

  it("separates adopted facts from reference-only materials", () => {
    const result = buildReviewerContext(createReviewerFixtureProject(), REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.adoptedFacts.some((item) => item.materialId === "mat_project_context")).toBe(true);
    expect(result.input.referenceOnlyMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ materialId: "mat_reference_case" }),
    ]));
  });

  it("blocks missing and empty saved drafts before provider invocation", () => {
    const missing = createReviewerFixtureProject();
    missing.sectionDrafts = {};
    expect(buildReviewerContext(missing, REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID)).toEqual({
      ok: false,
      error: "REVIEWER_DRAFT_NOT_FOUND",
    });
    const empty = createReviewerFixtureProject("");
    expect(buildReviewerContext(empty, REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID)).toEqual({
      ok: false,
      error: "REVIEWER_DRAFT_EMPTY",
    });
  });

  it("blocks a route target outside the active confirmed outline", () => {
    expect(buildReviewerContext(createReviewerFixtureProject(), "ch_other", "sec_other")).toEqual({
      ok: false,
      error: "REVIEWER_TARGET_NOT_FOUND",
    });
  });

  it("preserves the original Reviewer role and adds only runtime mappings", async () => {
    const source = await readFile(path.join(process.cwd(), "docs", "prompts", "reviewer", "reviewer-prompt-v1.md"), "utf8");
    const context = buildReviewerContext(createReviewerFixtureProject(), REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    const runtime = buildReviewerRuntimePromptFromSource(source, context.input);
    for (const phrase of ["格式合规性", "内容完整性", "数据准确性", "逻辑一致性", "语言质量", "critical", "minor"]) {
      expect(runtime.prompt).toContain(phrase);
    }
    expect(runtime.prompt).toContain("referenceOnlyMaterials 只能作为结构和方法参考");
    expect(runtime.prompt).toContain("专业预测、专业参数、规模判断或效果承诺");
    expect(runtime.prompt).toContain('"sectionId": "sec_strategy"');
    expect(runtime.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
