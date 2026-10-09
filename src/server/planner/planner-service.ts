import { randomUUID } from "node:crypto";

import type { MaterialReadiness } from "@/domain/materials/schema";
import {
  PLANNER_OUTPUT_CONTRACT_VERSION,
  validatePlannerOutput,
  type PlannerFollowUpItem,
  type PlannerInput,
  type PlannerOutput,
  type PlannerSuggestion,
} from "@/server/planner/contracts";
import { buildPlannerContext } from "@/server/planner/context-builder";
import {
  PlannerProviderError,
  type PlannerModelProvider,
} from "@/server/planner/model-provider";
import { createPlannerRuntimePrompt } from "@/server/planner/runtime-prompt";
import {
  ProjectRepositoryError,
} from "@/server/projects/project-repository";

export type PlannerGenerationErrorCode =
  | "PLANNER_INPUT_INSUFFICIENT"
  | "PLANNER_NOT_CONFIGURED"
  | "PLANNER_TIMEOUT"
  | "PLANNER_RATE_LIMITED"
  | "PLANNER_PROVIDER_FAILED"
  | "PLANNER_EMPTY_RESPONSE"
  | "PLANNER_OUTPUT_INVALID"
  | "PLANNER_SAVE_FAILED";

export class PlannerGenerationError extends Error {
  constructor(
    public readonly code: PlannerGenerationErrorCode,
    public readonly blockingMissing: MaterialReadiness["blockingMissing"] = [],
  ) {
    super(code);
    this.name = "PlannerGenerationError";
  }
}

export type PlannerProjectRepository = {
  getById(projectId: string): ReturnType<import("@/server/projects/project-repository").ProjectRepository["getById"]>;
  saveLatestSuggestion(
    projectId: string,
    suggestion: unknown,
  ): ReturnType<import("@/server/projects/project-repository").ProjectRepository["saveLatestSuggestion"]>;
};

function mergeItems(
  modelItems: PlannerFollowUpItem[],
  systemItems: PlannerFollowUpItem[],
): PlannerFollowUpItem[] {
  const merged = new Map(modelItems.map((item) => [item.itemId, item]));
  for (const item of systemItems) merged.set(item.itemId, item);
  return [...merged.values()];
}

function mergeKnownFollowUps(
  output: PlannerOutput,
  input: PlannerInput,
): PlannerOutput {
  const missing = input.knownMissingMaterials.map((item) => ({
    itemId: `missing_${item.category}`,
    title: item.title,
    reason: item.reason,
    relatedNodeIds: [],
  }));
  const professional = input.pendingProfessionalConfirmations.map((item) => ({
    itemId: `professional_${item.materialId}`,
    title: item.title,
    reason: item.reason,
    relatedNodeIds: [],
  }));
  return {
    ...output,
    missingMaterials: mergeItems(output.missingMaterials, missing),
    professionalConfirmations: mergeItems(output.professionalConfirmations, professional),
  };
}

export class PlannerOutlineService {
  constructor(
    private readonly repository: PlannerProjectRepository,
    private readonly provider: PlannerModelProvider,
    private readonly requestedModel: string,
  ) {}

  async generateLatestSuggestion(projectId: string): Promise<PlannerSuggestion> {
    const project = await this.repository.getById(projectId);
    const context = buildPlannerContext(project);
    if (!context.ok) {
      throw new PlannerGenerationError("PLANNER_INPUT_INSUFFICIENT", context.blockingMissing);
    }
    const runtimePrompt = await createPlannerRuntimePrompt(context.input);
    const generationRequestId = `req_${randomUUID()}`;
    const generationId = `pln_${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const started = Date.now();
    let attemptCount = 0;

    let response;
    while (attemptCount < 2) {
      attemptCount += 1;
      try {
        response = await this.provider.generate({
          prompt: runtimePrompt.prompt,
          requestedModel: this.requestedModel,
          timeoutMs: 60_000,
          maxOutputTokens: 4096,
        });
        break;
      } catch (error) {
        if (!(error instanceof PlannerProviderError)) {
          throw new PlannerGenerationError("PLANNER_PROVIDER_FAILED");
        }
        if (!error.retryable || attemptCount === 2) {
          throw new PlannerGenerationError(error.code);
        }
      }
    }

    if (!response) throw new PlannerGenerationError("PLANNER_PROVIDER_FAILED");
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.rawText);
    } catch {
      throw new PlannerGenerationError("PLANNER_OUTPUT_INVALID");
    }
    const modelValidation = validatePlannerOutput(parsed, context.input, { requireWriterType: true });
    if (!modelValidation.ok) throw new PlannerGenerationError(modelValidation.error);
    const content = mergeKnownFollowUps(modelValidation.value, context.input);
    const mergedValidation = validatePlannerOutput(content, context.input, { requireWriterType: true });
    if (!mergedValidation.ok) throw new PlannerGenerationError(mergedValidation.error);

    const completedAt = new Date().toISOString();
    const suggestion: PlannerSuggestion = {
      generationId,
      generationRequestId,
      provider: this.provider.provider,
      requestedModel: this.requestedModel,
      resolvedModel: response.resolvedModel,
      providerResponseId: response.providerResponseId,
      promptVersion: runtimePrompt.metadata.promptVersion,
      promptSource: runtimePrompt.metadata.promptSource,
      parentPromptVersion: runtimePrompt.metadata.parentPromptVersion,
      contentHash: runtimePrompt.metadata.contentHash,
      contractVersion: PLANNER_OUTPUT_CONTRACT_VERSION,
      inputFingerprint: runtimePrompt.inputFingerprint,
      tokenUsage: response.tokenUsage,
      latencyMs: Date.now() - started,
      attemptCount,
      startedAt,
      completedAt,
      generatedAt: completedAt,
      content: mergedValidation.value,
    };
    try {
      return await this.repository.saveLatestSuggestion(projectId, suggestion);
    } catch (error) {
      if (error instanceof ProjectRepositoryError) {
        throw new PlannerGenerationError("PLANNER_SAVE_FAILED");
      }
      throw error;
    }
  }
}
