import type { WriterTokenUsage } from "@/server/writer/contracts";

export type ReviewerProviderRequest = { prompt: string; requestedModel: string; timeoutMs: number; maxOutputTokens?: number };
export type ReviewerProviderResult = {
  rawText: string;
  providerResponseId: string | null;
  resolvedModel: string;
  tokenUsage: WriterTokenUsage;
};
export type ReviewerProviderErrorCode =
  | "REVIEWER_NOT_CONFIGURED"
  | "REVIEWER_TIMEOUT"
  | "REVIEWER_RATE_LIMITED"
  | "REVIEWER_PROVIDER_FAILED"
  | "REVIEWER_EMPTY_RESPONSE";

export class ReviewerProviderError extends Error {
  constructor(public readonly code: ReviewerProviderErrorCode, public readonly retryable: boolean) {
    super(code);
    this.name = "ReviewerProviderError";
  }
}

export interface ReviewerModelProvider {
  readonly provider: string;
  generate(request: ReviewerProviderRequest): Promise<ReviewerProviderResult>;
}

type DeepSeekResponse = {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

export class DeepSeekReviewerProvider implements ReviewerModelProvider {
  readonly provider = "deepseek";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: { apiKey: string; baseUrl?: string; model?: string; fetchImplementation?: typeof fetch }) {
    this.baseUrl = (options.baseUrl?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
    this.model = options.model?.trim() || "deepseek-v4-flash";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generate(request: ReviewerProviderRequest): Promise<ReviewerProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({
          model: request.requestedModel || this.model,
          stream: false,
          thinking: { type: "disabled" },
          max_tokens: request.maxOutputTokens ?? 4096,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: request.prompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) throw new ReviewerProviderError("REVIEWER_RATE_LIMITED", true);
        if ([408, 500, 502, 503, 504].includes(response.status)) throw new ReviewerProviderError("REVIEWER_PROVIDER_FAILED", true);
        throw new ReviewerProviderError("REVIEWER_PROVIDER_FAILED", false);
      }
      const payload = await response.json() as DeepSeekResponse;
      const rawText = text(payload.choices?.[0]?.message?.content);
      if (!rawText) throw new ReviewerProviderError("REVIEWER_EMPTY_RESPONSE", true);
      return {
        rawText,
        providerResponseId: text(payload.id),
        resolvedModel: text(payload.model) ?? request.requestedModel ?? this.model,
        tokenUsage: {
          inputTokens: count(payload.usage?.prompt_tokens),
          outputTokens: count(payload.usage?.completion_tokens),
          totalTokens: count(payload.usage?.total_tokens),
        },
      };
    } catch (error) {
      if (error instanceof ReviewerProviderError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new ReviewerProviderError("REVIEWER_TIMEOUT", true);
      }
      throw new ReviewerProviderError("REVIEWER_PROVIDER_FAILED", true);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockReviewerProvider implements ReviewerModelProvider {
  readonly provider = "mock";
  public calls = 0;
  constructor(private readonly resolve: (request: ReviewerProviderRequest) => Promise<ReviewerProviderResult> | ReviewerProviderResult) {}
  async generate(request: ReviewerProviderRequest) {
    this.calls += 1;
    return this.resolve(request);
  }
}

export function createDeepSeekReviewerProviderFromEnvironment() {
  if ((process.env.AI_PROVIDER?.trim() || "deepseek") !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new ReviewerProviderError("REVIEWER_NOT_CONFIGURED", false);
  }
  return new DeepSeekReviewerProvider({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: getConfiguredReviewerModel(),
    baseUrl: process.env.DEEPSEEK_BASE_URL,
  });
}

export function getConfiguredReviewerModel() {
  return process.env.DEEPSEEK_REVIEWER_MODEL?.trim()
    || process.env.DEEPSEEK_WRITER_MODEL?.trim()
    || process.env.DEEPSEEK_PLANNER_MODEL?.trim()
    || "deepseek-v4-flash";
}
