import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ProjectDocument } from "@/domain/projects/schema";
import { ProjectRepository, ProjectRepositoryError } from "@/server/projects/project-repository";
import {
  createIssueSignature,
  REVIEW_DIMENSIONS,
  type ReviewIssueType,
  type ReviewRevisionSuggestion,
  type ReviewRun,
} from "@/server/reviewer/contracts";
import {
  createReviewerFixtureProject,
  reviewerTestContent,
  REVIEWER_TEST_CHAPTER_ID,
  REVIEWER_TEST_SECTION_ID,
} from "@/server/reviewer/test-fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function repositoryFor(project = createReviewerFixtureProject()) {
  const root = await mkdtemp(path.join(os.tmpdir(), "planning-reviewer-repo-"));
  roots.push(root);
  await mkdir(path.join(root, "items"), { recursive: true });
  await writeFile(path.join(root, "items", "a-village.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  return { root, repository: new ProjectRepository({ dataRoot: root }) };
}

function run(sourceRevision: number, sourceFingerprint: string, type: ReviewIssueType, suffix = "1"): ReviewRun {
  const outputIssue = {
    dimension: "facts_evidence" as const,
    type,
    location: "第一段",
    problem: "人口数据与资料冲突",
    evidence: "资料为 1200 人，正文为 9999 人",
    impact: "影响事实准确性",
    suggestion: "按资料修正",
  };
  const now = `2026-07-30T08:0${suffix}:00.000Z`;
  return {
    reviewId: `rev_${suffix}`,
    projectId: "a-village",
    chapterId: REVIEWER_TEST_CHAPTER_ID,
    sectionId: REVIEWER_TEST_SECTION_ID,
    sourceDraftRevision: sourceRevision,
    sourceFingerprint,
    reviewResult: type === "must_fix" ? "revise" : "pass",
    dimensionResults: REVIEW_DIMENSIONS.map((dimension) => ({ dimension, status: dimension === "facts_evidence" ? "warning" : "pass", summary: "已校核" })),
    issues: [{ ...outputIssue, issueId: `iss_${suffix}`, issueSignature: createIssueSignature(outputIssue) }],
    reviewSummary: "校核完成。",
    callMetadata: {
      provider: "mock",
      requestedModel: "mock",
      resolvedModel: "mock",
      providerResponseId: null,
      promptVersion: "reviewer-section-v1",
      inputFingerprint: "a".repeat(64),
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      attemptCount: 1,
      startedAt: now,
      completedAt: now,
    },
    createdAt: now,
  };
}

async function append(repository: ProjectRepository, type: ReviewIssueType, suffix = "1") {
  const workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
  return repository.appendReviewRun(
    "a-village",
    REVIEWER_TEST_CHAPTER_ID,
    REVIEWER_TEST_SECTION_ID,
    run(workspace.draft!.workingDraft!.revision, workspace.sourceFingerprint!, type, suffix),
  );
}

function revisionSuggestion(reviewId: string, issueId: string, sourceRevision: number, sourceFingerprint: string, content = "修正后：当前常住人口为 1200 人。"): ReviewRevisionSuggestion {
  const now = "2026-07-30T08:10:00.000Z";
  return {
    issueId,
    sourceReviewId: reviewId,
    sourceDraftRevision: sourceRevision,
    sourceFingerprint,
    createdAt: now,
    suggestion: {
      generationId: `wrt_${issueId}`,
      generationRequestId: `req_${issueId}`,
      provider: "mock",
      requestedModel: "mock",
      resolvedModel: "mock",
      providerResponseId: null,
      promptVersion: "writer-strategy-section-v1-review-revision",
      promptSource: "docs/prompts/writer/strategy-writer-prompt-v1.md",
      parentPromptVersion: "writer-strategy-section-v1",
      contentHash: "b".repeat(64),
      contractVersion: 1,
      inputFingerprint: "c".repeat(64),
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      attemptCount: 1,
      startedAt: now,
      completedAt: now,
      generatedAt: now,
      content: reviewerTestContent(content),
    },
  };
}

describe("Reviewer ProjectRepository", () => {
  it("appends immutable runs and reads the latest report from the same section", async () => {
    const { repository } = await repositoryFor();
    await append(repository, "suggestion");
    await append(repository, "suggestion", "2");
    const workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(workspace.review?.runs.map((item) => item.reviewId)).toEqual(["rev_1", "rev_2"]);
    expect(workspace.latestRun?.reviewId).toBe("rev_2");
    expect(workspace.isLatestReviewCurrent).toBe(true);
  });

  it("marks the latest report stale after the working draft changes", async () => {
    const { repository } = await repositoryFor();
    await append(repository, "suggestion");
    await repository.saveSectionDraft("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, {
      expectedRevision: 1,
      contentMarkdown: "人工修改后的正文。",
    });
    const workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(workspace.isLatestReviewCurrent).toBe(false);
    await expect(repository.confirmReviewedSection("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toMatchObject({ code: "SECTION_REVIEW_STALE" });
  });

  it("blocks must-fix confirmation on the server", async () => {
    const { repository } = await repositoryFor();
    await append(repository, "must_fix");
    await expect(repository.confirmReviewedSection("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toEqual(new ProjectRepositoryError("SECTION_REVIEW_BLOCKED"));
  });

  it("does not let a suggestion alone block section confirmation", async () => {
    const { repository } = await repositoryFor();
    await append(repository, "suggestion");
    await expect(repository.confirmReviewedSection("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .resolves.toMatchObject({ version: 1 });
  });

  it("requires professional confirmation handling and then appends a confirmation snapshot", async () => {
    const { repository } = await repositoryFor();
    const reviewRun = await append(repository, "professional_confirmation");
    await expect(repository.confirmReviewedSection("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID))
      .rejects.toMatchObject({ code: "SECTION_REVIEW_BLOCKED" });
    await repository.updateReviewIssue("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, reviewRun.issues[0].issueId, {
      decision: "accepted",
      note: "专业负责人确认采用。",
    });
    const confirmation = await repository.confirmReviewedSection("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    const workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(confirmation.version).toBe(1);
    expect(workspace.review?.confirmations).toHaveLength(1);
    expect(workspace.draft?.versions.at(-1)?.source).toBe("section_confirmed");
  });

  it("keeps AI revision suggestions separate until explicit application", async () => {
    const { repository } = await repositoryFor();
    const reviewRun = await append(repository, "must_fix");
    const before = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    const candidate = revisionSuggestion(reviewRun.reviewId, reviewRun.issues[0].issueId, 1, before.sourceFingerprint!);
    await repository.saveReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, candidate);
    const separated = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(separated.draft?.workingDraft?.contentMarkdown).toContain("9999");
    expect(separated.review?.revisionSuggestions[reviewRun.issues[0].issueId]).toEqual(candidate);
    await repository.applyReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, reviewRun.issues[0].issueId, { expectedRevision: 1 });
    const applied = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    expect(applied.draft?.workingDraft?.contentMarkdown).toContain("1200");
    expect(applied.draft?.versions.at(-1)?.source).toBe("ai_revision_applied");
    expect(applied.isLatestReviewCurrent).toBe(false);
  });

  it("rejects stale revision application without polluting the stored project", async () => {
    const { root, repository } = await repositoryFor();
    const reviewRun = await append(repository, "must_fix");
    const workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    await repository.saveReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, revisionSuggestion(reviewRun.reviewId, reviewRun.issues[0].issueId, 1, workspace.sourceFingerprint!));
    await expect(repository.applyReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, reviewRun.issues[0].issueId, { expectedRevision: 9 }))
      .rejects.toMatchObject({ code: "SECTION_DRAFT_CONFLICT" });
    const stored = JSON.parse(await readFile(path.join(root, "items", "a-village.json"), "utf8")) as ProjectDocument;
    expect(stored.sectionDrafts[REVIEWER_TEST_SECTION_ID].workingDraft?.revision).toBe(1);
  });

  it("limits the same issue to two AI revisions and transfers it to manual handling after re-review", async () => {
    const { repository } = await repositoryFor();
    const first = await append(repository, "must_fix");
    let workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    await repository.saveReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, revisionSuggestion(first.reviewId, first.issues[0].issueId, 1, workspace.sourceFingerprint!, "第一次建议"));
    await repository.saveReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, revisionSuggestion(first.reviewId, first.issues[0].issueId, 1, workspace.sourceFingerprint!, "第二次建议"));
    await expect(repository.saveReviewRevisionSuggestion("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID, revisionSuggestion(first.reviewId, first.issues[0].issueId, 1, workspace.sourceFingerprint!, "第三次建议")))
      .rejects.toMatchObject({ code: "REVIEW_ISSUE_ATTEMPTS_EXHAUSTED" });

    await append(repository, "must_fix", "2");
    workspace = await repository.getSectionReview("a-village", REVIEWER_TEST_CHAPTER_ID, REVIEWER_TEST_SECTION_ID);
    const latestIssue = workspace.latestRun!.issues[0];
    expect(workspace.review?.issueStates[latestIssue.issueId]).toMatchObject({
      status: "manual_required",
      autoRevisionAttemptCount: 2,
    });
    expect(workspace.review?.professionalTasks).toHaveLength(1);
  });
});
