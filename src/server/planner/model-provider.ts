import type { PlannerTokenUsage } from "@/server/planner/contracts";

export type PlannerProviderRequest = {
  prompt: string;
  requestedModel: string;
  timeoutMs: number;
  maxOutputTokens?: number;
};

export type PlannerProviderResult = {
  rawText: string;
  providerResponseId: string | null;
  resolvedModel: string;
  tokenUsage: PlannerTokenUsage;
};

export type PlannerProviderErrorCode =
  | "PLANNER_NOT_CONFIGURED"
  | "PLANNER_TIMEOUT"
  | "PLANNER_RATE_LIMITED"
  | "PLANNER_PROVIDER_FAILED"
  | "PLANNER_EMPTY_RESPONSE";

export class PlannerProviderError extends Error {
  constructor(
    public readonly code: PlannerProviderErrorCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "PlannerProviderError";
  }
}

export interface PlannerModelProvider {
  readonly provider: string;
  generate(request: PlannerProviderRequest): Promise<PlannerProviderResult>;
}

export type DeepSeekPlannerProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImplementation?: typeof fetch;
};

type DeepSeekResponse = {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
};

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export class DeepSeekPlannerProvider implements PlannerModelProvider {
  readonly provider = "deepseek";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: DeepSeekPlannerProviderOptions) {
    this.baseUrl = (options.baseUrl?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
    this.model = options.model?.trim() || "deepseek-v4-flash";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generate(request: PlannerProviderRequest): Promise<PlannerProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
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
        if (response.status === 429) throw new PlannerProviderError("PLANNER_RATE_LIMITED", true);
        if (response.status === 408 || response.status === 500 || response.status === 503) {
          throw new PlannerProviderError("PLANNER_PROVIDER_FAILED", true);
        }
        throw new PlannerProviderError("PLANNER_PROVIDER_FAILED", false);
      }
      const payload = await response.json() as DeepSeekResponse;
      const rawText = textOrNull(payload.choices?.[0]?.message?.content);
      if (!rawText) throw new PlannerProviderError("PLANNER_EMPTY_RESPONSE", false);
      return {
        rawText,
        providerResponseId: textOrNull(payload.id),
        resolvedModel: textOrNull(payload.model) ?? request.requestedModel ?? this.model,
        tokenUsage: {
          inputTokens: tokenCount(payload.usage?.prompt_tokens),
          outputTokens: tokenCount(payload.usage?.completion_tokens),
          totalTokens: tokenCount(payload.usage?.total_tokens),
        },
      };
    } catch (error) {
      if (error instanceof PlannerProviderError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new PlannerProviderError("PLANNER_TIMEOUT", true);
      }
      throw new PlannerProviderError("PLANNER_PROVIDER_FAILED", true);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockPlannerProvider implements PlannerModelProvider {
  readonly provider = "mock";
  public calls = 0;

  constructor(
    private readonly resolve: (
      request: PlannerProviderRequest,
    ) => Promise<PlannerProviderResult> | PlannerProviderResult,
  ) {}

  async generate(request: PlannerProviderRequest): Promise<PlannerProviderResult> {
    this.calls += 1;
    return this.resolve(request);
  }
}

export function createDeepSeekPlannerProviderFromEnvironment(): DeepSeekPlannerProvider {
  const provider = process.env.AI_PROVIDER?.trim() || "deepseek";
  if (provider !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new PlannerProviderError("PLANNER_NOT_CONFIGURED", false);
  }
  return new DeepSeekPlannerProvider({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_PLANNER_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
  });
}

export function getConfiguredPlannerModel(): string {
  return process.env.DEEPSEEK_PLANNER_MODEL?.trim() || "deepseek-v4-flash";
}
