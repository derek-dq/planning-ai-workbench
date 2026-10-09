import { describe, expect, it } from "vitest";

import {
  createDraftFingerprint,
  createIssueSignature,
  REVIEW_DIMENSIONS,
  validateReviewerOutput,
} from "@/server/reviewer/contracts";
import { reviewerTestContent } from "@/server/reviewer/test-fixture";

function validOutput() {
  return {
    reviewResult: "revise",
    dimensionResults: REVIEW_DIMENSIONS.map((dimension) => ({
      dimension,
      status: dimension === "facts_evidence" ? "fail" : "pass",
      summary: `${dimension} 校核完成`,
    })),
    issues: [{
      dimension: "facts_evidence",
      type: "must_fix",
      location: "第一段",
      problem: "人口数据与项目资料冲突",
      evidence: "项目资料为 1200 人，正文为 9999 人",
      impact: "导致项目事实错误",
      suggestion: "按已确认资料修正人口数据",
    }],
    reviewSummary: "存在一项必须处理问题。",
  } as const;
}

describe("Reviewer contracts", () => {
  it("accepts five complete dimensions and a must-fix revise result", () => {
    expect(validateReviewerOutput(validOutput()).ok).toBe(true);
  });

  it("rejects missing or duplicate dimensions", () => {
    const missing = validOutput();
    expect(validateReviewerOutput({ ...missing, dimensionResults: missing.dimensionResults.slice(0, 4) }).ok).toBe(false);
    expect(validateReviewerOutput({ ...missing, dimensionResults: [...missing.dimensionResults.slice(0, 4), missing.dimensionResults[0]] }).ok).toBe(false);
  });

  it("rejects pass when a must-fix issue exists", () => {
    expect(validateReviewerOutput({ ...validOutput(), reviewResult: "pass" }).ok).toBe(false);
  });

  it("allows pass with suggestions and professional confirmations only", () => {
    const output = validOutput();
    expect(validateReviewerOutput({
      ...output,
      reviewResult: "pass",
      issues: [
        { ...output.issues[0], type: "suggestion" },
        { ...output.issues[0], type: "professional_confirmation" },
      ],
    }).ok).toBe(true);
  });

  it("rejects incomplete issue evidence or impact", () => {
    const output = validOutput();
    expect(validateReviewerOutput({ ...output, issues: [{ ...output.issues[0], impact: "" }] }).ok).toBe(false);
  });

  it("creates stable draft fingerprints and issue signatures", () => {
    const target = { confirmedOutlineVersion: 1, chapterId: "ch_strategy", sectionId: "sec_strategy", sectionTitle: "产业发展策略" };
    const first = createDraftFingerprint({ ...reviewerTestContent(), revision: 1 }, target);
    const second = createDraftFingerprint({ ...reviewerTestContent(), revision: 2 }, target);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    const issue = validOutput().issues[0];
    expect(createIssueSignature(issue)).toBe(createIssueSignature({ ...issue, location: "  第一段  " }));
  });
});
