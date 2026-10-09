import { describe, expect, it } from "vitest";

import { REVIEW_DIMENSIONS, type ReviewRun } from "@/server/reviewer/contracts";
import { MockReviewerProvider, ReviewerProviderError } from "@/server/reviewer/model-provider";
import { ReviewerGenerationError, ReviewerService } from "@/server/reviewer/reviewer-service";
import {
  createReviewerFixtureProject,
  REVIEWER_TEST_CHAPTER_ID,
  REVIEWER_TEST_SECTION_ID,
} from "@/server/reviewer/test-fixture";

function output(issues: Array<Record<string, string>> = [{
  dimension: "facts_evidence",
  type: "must_fix",
  location: "第一段",
  problem: "人口数据冲突",
  evidence: "资料 1200 人，正文 9999 人",
  impact: "事实错误",
  suggestion: "按已确认资料修正",
}]) {
  return JSON.stringify({
    reviewResult: issues.some((issue) => issue.type === "must_fix") ? "revise" : "pass",
    dimensionResults: REVIEW_DIMENSIONS.map((dimension) => ({
      dimension,
      status: dimension === "facts_evidence" && issues.length ? "fail" : "pass",
      summary: `${dimension} 已校核`,
    })),
    issues,
    reviewSummary: issues.length ? "存在待处理问题。" : "当前内容通过校核。",
  });
}

function result(rawText = output()) {
  return {
    rawText,
    providerResponseId: "review_response",
    resolvedModel: "mock-reviewer",
    tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  };
}

describe("ReviewerService", () => {
  it("uses a Mock provider and appends a metadata-complete immutable run", async () => {
    let saved: ReviewRun | null = null;
    const provider = new MockReviewerProvider(() => result());
    const service = new ReviewerService({
      getById: async () => createReviewerFixtureProject(),
      appendReviewRun: async (_projectId, _chapterId, _sectionId, run) => { saved = run; return run; },
    }, provider, "mock-reviewer");
    const run = await service.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(provider.calls).toBe(1);
    expect(run.issues[0]).toMatchObject({ type: "must_fix", issueId: expect.any(String), issueSignature: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(run.callMetadata).toMatchObject({ provider: "mock", requestedModel: "mock-reviewer", attemptCount: 1, tokenUsage: { totalTokens: 30 } });
    expect(saved).toEqual(run);
  });

  it("does not call the provider for an empty draft", async () => {
    const provider = new MockReviewerProvider(() => result());
    const service = new ReviewerService({
      getById: async () => createReviewerFixtureProject(""),
      appendReviewRun: async () => { throw new Error("must not save"); },
    }, provider, "mock-reviewer");
    await expect(service.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toMatchObject({ code: "REVIEWER_DRAFT_EMPTY" });
    expect(provider.calls).toBe(0);
  });

  it("rejects invalid JSON and never saves a fake report", async () => {
    let saves = 0;
    const service = new ReviewerService({
      getById: async () => createReviewerFixtureProject(),
      appendReviewRun: async (_projectId, _chapterId, _sectionId, run) => { saves += 1; return run; },
    }, new MockReviewerProvider(() => result("{bad")), "mock-reviewer");
    await expect(service.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toMatchObject({ code: "REVIEWER_OUTPUT_INVALID" });
    expect(saves).toBe(0);
  });

  it("rejects schema/business-invalid output and never saves", async () => {
    let saves = 0;
    const invalid = JSON.parse(output());
    invalid.reviewResult = "pass";
    const service = new ReviewerService({
      getById: async () => createReviewerFixtureProject(),
      appendReviewRun: async (_projectId, _chapterId, _sectionId, run) => { saves += 1; return run; },
    }, new MockReviewerProvider(() => result(JSON.stringify(invalid))), "mock-reviewer");
    await expect(service.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toMatchObject({ code: "REVIEWER_OUTPUT_INVALID" });
    expect(saves).toBe(0);
  });

  it("retries one transient error and stops after the second failure", async () => {
    let calls = 0;
    const provider = {
      provider: "mock",
      generate: async () => {
        calls += 1;
        if (calls === 1) throw new ReviewerProviderError("REVIEWER_TIMEOUT", true);
        return result();
      },
    };
    const service = new ReviewerService({
      getById: async () => createReviewerFixtureProject(),
      appendReviewRun: async (_projectId, _chapterId, _sectionId, run) => run,
    }, provider, "mock-reviewer");
    const run = await service.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(calls).toBe(2);
    expect(run.callMetadata.attemptCount).toBe(2);

    const failing = new ReviewerService({
      getById: async () => createReviewerFixtureProject(),
      appendReviewRun: async (_projectId, _chapterId, _sectionId, run) => run,
    }, { provider: "mock", generate: async () => { throw new ReviewerProviderError("REVIEWER_RATE_LIMITED", true); } }, "mock-reviewer");
    await expect(failing.reviewCurrentDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toBeInstanceOf(ReviewerGenerationError);
  });
});
