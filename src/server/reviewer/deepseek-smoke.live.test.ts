import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { ProjectRepository } from "@/server/projects/project-repository";
import {
  createDeepSeekReviewerProviderFromEnvironment,
  getConfiguredReviewerModel,
} from "@/server/reviewer/model-provider";
import { ReviewerService } from "@/server/reviewer/reviewer-service";
import {
  createReviewerFixtureProject,
  REVIEWER_TEST_CHAPTER_ID,
  REVIEWER_TEST_SECTION_ID,
} from "@/server/reviewer/test-fixture";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planning-ai-reviewer-smoke-"));

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("DeepSeek Reviewer live smoke test", () => {
  it("detects the seeded fact conflict and stores a metadata-complete review in an isolated project", async () => {
    if (process.env.AI_PROVIDER !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
      throw new Error("Set AI_PROVIDER=deepseek and DEEPSEEK_API_KEY before running this live smoke test.");
    }

    const itemsDirectory = path.join(temporaryRoot, "items");
    await mkdir(itemsDirectory, { recursive: true });
    await writeFile(
      path.join(itemsDirectory, "a-village.json"),
      `${JSON.stringify(createReviewerFixtureProject(), null, 2)}\n`,
      "utf8",
    );
    const repository = new ProjectRepository({ dataRoot: temporaryRoot });
    const service = new ReviewerService(
      repository,
      createDeepSeekReviewerProviderFromEnvironment(),
      getConfiguredReviewerModel(),
    );

    const run = await service.reviewCurrentDraft(
      "a-village",
      REVIEWER_TEST_CHAPTER_ID,
      REVIEWER_TEST_SECTION_ID,
    );
    const stored = await repository.getSectionReview(
      "a-village",
      REVIEWER_TEST_CHAPTER_ID,
      REVIEWER_TEST_SECTION_ID,
    );

    expect(run.callMetadata.provider).toBe("deepseek");
    expect(run.dimensionResults).toHaveLength(5);
    expect(run.issues.some((issue) => issue.type === "must_fix")).toBe(true);
    expect(run.callMetadata.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(run.callMetadata.resolvedModel.length).toBeGreaterThan(0);
    expect(run.callMetadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(stored.latestRun?.reviewId).toBe(run.reviewId);
    expect(stored.isLatestReviewCurrent).toBe(true);
  }, 130_000);
});
