import { randomUUID } from "node:crypto";
import { buildWriterContext } from "@/server/writer/context-builder";
import { validateWriterContent, WRITER_OUTPUT_CONTRACT_VERSION, type WriterSuggestion } from "@/server/writer/contracts";
import { WriterProviderError, type WriterModelProvider } from "@/server/writer/model-provider";
import { createWriterRuntimePrompt } from "@/server/writer/runtime-prompt";
import { ProjectRepositoryError } from "@/server/projects/project-repository";

export type WriterGenerationErrorCode = "WRITER_INPUT_INSUFFICIENT" | "WRITER_TARGET_NOT_FOUND" | "WRITER_DEPENDENCY_UNMET" | "WRITER_NOT_CONFIGURED" | "WRITER_TIMEOUT" | "WRITER_RATE_LIMITED" | "WRITER_PROVIDER_FAILED" | "WRITER_EMPTY_RESPONSE" | "WRITER_OUTPUT_INVALID" | "WRITER_SAVE_FAILED";
export class WriterGenerationError extends Error { constructor(public readonly code: WriterGenerationErrorCode, public readonly blockingMissing: string[] = []) { super(code); this.name = "WriterGenerationError"; } }
export type WriterProjectRepository = { getById(projectId: string): Promise<import("@/domain/projects/schema").ProjectDocument>; saveSectionSuggestion(projectId: string, chapterId: string, sectionId: string, suggestion: WriterSuggestion): Promise<WriterSuggestion> };

export class WriterService {
  constructor(private readonly repository: WriterProjectRepository, private readonly provider: WriterModelProvider, private readonly requestedModel: string) {}
  async generateLatestSuggestion(projectId: string, chapterId: string, sectionId: string) {
    const project = await this.repository.getById(projectId); const context = buildWriterContext(project, chapterId, sectionId);
    if (!context.ok) throw new WriterGenerationError(context.error, context.blockingMissing);
    const runtime = await createWriterRuntimePrompt(context.input); const startedAt = new Date().toISOString(); const started = Date.now(); let attemptCount = 0; let response: Awaited<ReturnType<WriterModelProvider["generate"]>> | undefined;
    while (attemptCount < 2) { attemptCount += 1; try { response = await this.provider.generate({ prompt: runtime.prompt, requestedModel: this.requestedModel, timeoutMs: 60_000, maxOutputTokens: 3072 }); break; } catch (error) { if (!(error instanceof WriterProviderError)) throw new WriterGenerationError("WRITER_PROVIDER_FAILED"); if (!error.retryable || attemptCount === 2) throw new WriterGenerationError(error.code); } }
    if (!response) throw new WriterGenerationError("WRITER_PROVIDER_FAILED"); let parsed: unknown; try { parsed = JSON.parse(response.rawText); } catch { throw new WriterGenerationError("WRITER_OUTPUT_INVALID"); }
    const validation = validateWriterContent(parsed, context.input, runtime.definition.requireStrategyMapping); if (!validation.ok) throw new WriterGenerationError(validation.error);
    const completedAt = new Date().toISOString(); const suggestion: WriterSuggestion = { generationId: `wrt_${randomUUID()}`, generationRequestId: `req_${randomUUID()}`, provider: this.provider.provider, requestedModel: this.requestedModel, resolvedModel: response.resolvedModel, providerResponseId: response.providerResponseId, promptVersion: runtime.metadata.promptVersion, promptSource: runtime.metadata.promptSource, parentPromptVersion: runtime.metadata.parentPromptVersion, contentHash: runtime.metadata.contentHash, contractVersion: WRITER_OUTPUT_CONTRACT_VERSION, inputFingerprint: runtime.inputFingerprint, tokenUsage: response.tokenUsage, latencyMs: Date.now() - started, attemptCount, startedAt, completedAt, generatedAt: completedAt, content: validation.value };
    try { return await this.repository.saveSectionSuggestion(projectId, chapterId, sectionId, suggestion); } catch (error) { if (error instanceof ProjectRepositoryError) throw new WriterGenerationError("WRITER_SAVE_FAILED"); throw error; }
  }
}
