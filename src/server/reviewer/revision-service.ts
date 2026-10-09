import { createHash, randomUUID } from "node:crypto";

import { ProjectRepositoryError } from "@/server/projects/project-repository";
import type { ReviewRevisionSuggestion } from "@/server/reviewer/contracts";
import { buildWriterContext } from "@/server/writer/context-builder";
import {
  validateWriterContent,
  WRITER_OUTPUT_CONTRACT_VERSION,
  type WriterSuggestion,
} from "@/server/writer/contracts";
import { WriterProviderError, type WriterModelProvider } from "@/server/writer/model-provider";
import { createWriterRuntimePrompt } from "@/server/writer/runtime-prompt";

export type ReviewRevisionRepository = {
  getSectionReview(projectId: string, chapterId: string, sectionId: string): Promise<Awaited<ReturnType<import("@/server/projects/project-repository").ProjectRepository["getSectionReview"]>>>;
  saveReviewRevisionSuggestion(projectId: string, chapterId: string, sectionId: string, suggestion: ReviewRevisionSuggestion): Promise<ReviewRevisionSuggestion>;
};

export type ReviewRevisionErrorCode =
  | "SECTION_REVIEW_STALE"
  | "REVIEW_ISSUE_NOT_FOUND"
  | "REVIEW_ISSUE_ATTEMPTS_EXHAUSTED"
  | "WRITER_INPUT_INSUFFICIENT"
  | "WRITER_TARGET_NOT_FOUND"
  | "WRITER_DEPENDENCY_UNMET"
  | "WRITER_NOT_CONFIGURED"
  | "WRITER_TIMEOUT"
  | "WRITER_RATE_LIMITED"
  | "WRITER_PROVIDER_FAILED"
  | "WRITER_EMPTY_RESPONSE"
  | "WRITER_OUTPUT_INVALID"
  | "REVIEW_REVISION_SAVE_FAILED";

export class ReviewRevisionError extends Error {
  constructor(public readonly code: ReviewRevisionErrorCode) {
    super(code);
    this.name = "ReviewRevisionError";
  }
}

export class ReviewRevisionService {
  constructor(
    private readonly repository: ReviewRevisionRepository,
    private readonly provider: WriterModelProvider,
    private readonly requestedModel: string,
  ) {}

  async generate(projectId: string, chapterId: string, sectionId: string, issueId: string) {
    const workspace = await this.repository.getSectionReview(projectId, chapterId, sectionId);
    if (!workspace.review || !workspace.latestRun || !workspace.isLatestReviewCurrent || !workspace.draft?.workingDraft || !workspace.sourceFingerprint) {
      throw new ReviewRevisionError("SECTION_REVIEW_STALE");
    }
    const issue = workspace.latestRun.issues.find((item) => item.issueId === issueId);
    const state = issue ? workspace.review.issueStates[issue.issueId] : undefined;
    if (!issue || !state) throw new ReviewRevisionError("REVIEW_ISSUE_NOT_FOUND");
    if (state.autoRevisionAttemptCount >= 2 || state.status === "manual_required") {
      throw new ReviewRevisionError("REVIEW_ISSUE_ATTEMPTS_EXHAUSTED");
    }

    const writerContext = buildWriterContext(workspace.project, chapterId, sectionId);
    if (!writerContext.ok) throw new ReviewRevisionError(writerContext.error);
    const runtime = await createWriterRuntimePrompt(writerContext.input);
    const prompt = `${runtime.prompt}

# Issue-scoped revision

本次不是重新生成整份方案，也不是修改方案结构。请以当前人工草稿为基础，只修复下面一个校核问题，并返回完整的当前子节 Writer JSON，供用户预览后明确应用。

<current_draft>
${workspace.draft.workingDraft.contentMarkdown}
</current_draft>

<selected_review_issue>
${JSON.stringify({
  dimension: issue.dimension,
  type: issue.type,
  location: issue.location,
  problem: issue.problem,
  evidence: issue.evidence,
  impact: issue.impact,
  suggestion: issue.suggestion,
}, null, 2)}
</selected_review_issue>

不得改变未涉及的事实，不得生成其他子节；缺少依据时继续列入 missingInfo 或 humanConfirmation。`;
    const startedAt = new Date().toISOString();
    const started = Date.now();
    let attemptCount = 0;
    let response: Awaited<ReturnType<WriterModelProvider["generate"]>> | undefined;
    while (attemptCount < 2) {
      attemptCount += 1;
      try {
        response = await this.provider.generate({ prompt, requestedModel: this.requestedModel, timeoutMs: 60_000 });
        break;
      } catch (error) {
        if (!(error instanceof WriterProviderError)) throw new ReviewRevisionError("WRITER_PROVIDER_FAILED");
        if (!error.retryable || attemptCount === 2) throw new ReviewRevisionError(error.code);
      }
    }
    if (!response) throw new ReviewRevisionError("WRITER_PROVIDER_FAILED");
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.rawText);
    } catch {
      throw new ReviewRevisionError("WRITER_OUTPUT_INVALID");
    }
    const validation = validateWriterContent(parsed, writerContext.input, true);
    if (!validation.ok) throw new ReviewRevisionError(validation.error);
    const completedAt = new Date().toISOString();
    const suggestion: WriterSuggestion = {
      generationId: `wrt_${randomUUID()}`,
      generationRequestId: `req_${randomUUID()}`,
      provider: this.provider.provider,
      requestedModel: this.requestedModel,
      resolvedModel: response.resolvedModel,
      providerResponseId: response.providerResponseId,
      promptVersion: "writer-strategy-section-v1-review-revision",
      promptSource: runtime.metadata.promptSource,
      parentPromptVersion: runtime.metadata.promptVersion,
      contentHash: createHash("sha256").update(prompt, "utf8").digest("hex"),
      contractVersion: WRITER_OUTPUT_CONTRACT_VERSION,
      inputFingerprint: createHash("sha256").update(`${runtime.inputFingerprint}:${workspace.latestRun.reviewId}:${issue.issueSignature}:${workspace.sourceFingerprint}`, "utf8").digest("hex"),
      tokenUsage: response.tokenUsage,
      latencyMs: Date.now() - started,
      attemptCount,
      startedAt,
      completedAt,
      generatedAt: completedAt,
      content: validation.value,
    };
    const revisionSuggestion: ReviewRevisionSuggestion = {
      issueId,
      sourceReviewId: workspace.latestRun.reviewId,
      sourceDraftRevision: workspace.draft.workingDraft.revision,
      sourceFingerprint: workspace.sourceFingerprint,
      suggestion,
      createdAt: completedAt,
    };
    try {
      return await this.repository.saveReviewRevisionSuggestion(projectId, chapterId, sectionId, revisionSuggestion);
    } catch (error) {
      if (error instanceof ProjectRepositoryError) {
        if (error.code === "SECTION_REVIEW_STALE" || error.code === "REVIEW_ISSUE_NOT_FOUND" || error.code === "REVIEW_ISSUE_ATTEMPTS_EXHAUSTED") {
          throw new ReviewRevisionError(error.code);
        }
        throw new ReviewRevisionError("REVIEW_REVISION_SAVE_FAILED");
      }
      throw error;
    }
  }
}
