import { randomUUID } from "node:crypto";

import { ProjectRepositoryError } from "@/server/projects/project-repository";
import {
  createIssueSignature,
  validateReviewerOutput,
  type ReviewIssue,
  type ReviewRun,
} from "@/server/reviewer/contracts";
import { buildReviewerContext } from "@/server/reviewer/context-builder";
import { ReviewerProviderError, type ReviewerModelProvider } from "@/server/reviewer/model-provider";
import { createReviewerRuntimePrompt } from "@/server/reviewer/runtime-prompt";

export type ReviewerServiceRepository = {
  getById(projectId: string): Promise<import("@/domain/projects/schema").ProjectDocument>;
  appendReviewRun(projectId: string, chapterId: string, sectionId: string, run: ReviewRun): Promise<ReviewRun>;
};

export type ReviewerGenerationErrorCode =
  | "REVIEWER_TARGET_NOT_FOUND"
  | "REVIEWER_DRAFT_NOT_FOUND"
  | "REVIEWER_DRAFT_EMPTY"
  | "REVIEWER_INPUT_INSUFFICIENT"
  | "REVIEWER_DEPENDENCY_UNMET"
  | "REVIEWER_NOT_CONFIGURED"
  | "REVIEWER_TIMEOUT"
  | "REVIEWER_RATE_LIMITED"
  | "REVIEWER_PROVIDER_FAILED"
  | "REVIEWER_EMPTY_RESPONSE"
  | "REVIEWER_OUTPUT_INVALID"
  | "REVIEWER_SAVE_FAILED";

export class ReviewerGenerationError extends Error {
  constructor(public readonly code: ReviewerGenerationErrorCode) {
    super(code);
    this.name = "ReviewerGenerationError";
  }
}

export class ReviewerService {
  constructor(
    private readonly repository: ReviewerServiceRepository,
    private readonly provider: ReviewerModelProvider,
    private readonly requestedModel: string,
  ) {}

  async reviewCurrentDraft(projectId: string, chapterId: string, sectionId: string) {
    const project = await this.repository.getById(projectId);
    const context = buildReviewerContext(project, chapterId, sectionId);
    if (!context.ok) throw new ReviewerGenerationError(context.error);

    const runtime = await createReviewerRuntimePrompt(context.input);
    const startedAt = new Date().toISOString();
    const started = Date.now();
    let attemptCount = 0;
    let response: Awaited<ReturnType<ReviewerModelProvider["generate"]>> | undefined;
    while (attemptCount < 2) {
      attemptCount += 1;
      try {
        response = await this.provider.generate({
          prompt: runtime.prompt,
          requestedModel: this.requestedModel,
          timeoutMs: 60_000,
          maxOutputTokens: 4096,
        });
        break;
      } catch (error) {
        if (!(error instanceof ReviewerProviderError)) throw new ReviewerGenerationError("REVIEWER_PROVIDER_FAILED");
        if (!error.retryable || attemptCount === 2) throw new ReviewerGenerationError(error.code);
      }
    }
    if (!response) throw new ReviewerGenerationError("REVIEWER_PROVIDER_FAILED");

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.rawText);
    } catch {
      throw new ReviewerGenerationError("REVIEWER_OUTPUT_INVALID");
    }
    const validation = validateReviewerOutput(parsed);
    if (!validation.ok) throw new ReviewerGenerationError(validation.error);

    const completedAt = new Date().toISOString();
    const issues: ReviewIssue[] = validation.value.issues.map((issue) => ({
      ...issue,
      issueId: `iss_${randomUUID()}`,
      issueSignature: createIssueSignature(issue),
    }));
    const run: ReviewRun = {
      reviewId: `rev_${randomUUID()}`,
      projectId,
      chapterId,
      sectionId,
      sourceDraftRevision: context.input.savedDraft.revision,
      sourceFingerprint: context.input.sourceFingerprint,
      reviewResult: validation.value.reviewResult,
      dimensionResults: validation.value.dimensionResults,
      issues,
      reviewSummary: validation.value.reviewSummary,
      callMetadata: {
        provider: this.provider.provider,
        requestedModel: this.requestedModel,
        resolvedModel: response.resolvedModel,
        providerResponseId: response.providerResponseId,
        promptVersion: runtime.metadata.promptVersion,
        inputFingerprint: runtime.inputFingerprint,
        tokenUsage: response.tokenUsage,
        latencyMs: Date.now() - started,
        attemptCount,
        startedAt,
        completedAt,
      },
      createdAt: completedAt,
    };
    try {
      return await this.repository.appendReviewRun(projectId, chapterId, sectionId, run);
    } catch (error) {
      if (error instanceof ProjectRepositoryError) throw new ReviewerGenerationError("REVIEWER_SAVE_FAILED");
      throw error;
    }
  }
}
