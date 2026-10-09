import type { WriterTokenUsage } from "@/server/writer/contracts";

export type WriterProviderRequest = { prompt: string; requestedModel: string; timeoutMs: number; maxOutputTokens?: number };
export type WriterProviderResult = { rawText: string; providerResponseId: string | null; resolvedModel: string; tokenUsage: WriterTokenUsage };
export type WriterProviderErrorCode = "WRITER_NOT_CONFIGURED" | "WRITER_TIMEOUT" | "WRITER_RATE_LIMITED" | "WRITER_PROVIDER_FAILED" | "WRITER_EMPTY_RESPONSE";
export class WriterProviderError extends Error { constructor(public readonly code: WriterProviderErrorCode, public readonly retryable: boolean) { super(code); this.name = "WriterProviderError"; } }
export interface WriterModelProvider { readonly provider: string; generate(request: WriterProviderRequest): Promise<WriterProviderResult>; }
type DeepSeekResponse = { id?: unknown; model?: unknown; choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

export class DeepSeekWriterProvider implements WriterModelProvider {
  readonly provider = "deepseek";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImplementation: typeof fetch;
  constructor(options: { apiKey: string; baseUrl?: string; model?: string; fetchImplementation?: typeof fetch }) { this.options = options; this.baseUrl = (options.baseUrl?.trim() || "https://api.deepseek.com").replace(/\/+$/, ""); this.model = options.model?.trim() || "deepseek-v4-flash"; this.fetchImplementation = options.fetchImplementation ?? fetch; }
  private readonly options: { apiKey: string; baseUrl?: string; model?: string; fetchImplementation?: typeof fetch };
  async generate(request: WriterProviderRequest): Promise<WriterProviderResult> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` }, body: JSON.stringify({ model: request.requestedModel || this.model, stream: false, thinking: { type: "disabled" }, max_tokens: request.maxOutputTokens ?? 3072, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: request.prompt }] }), signal: controller.signal });
      if (!response.ok) { if (response.status === 429) throw new WriterProviderError("WRITER_RATE_LIMITED", true); if ([408, 500, 503].includes(response.status)) throw new WriterProviderError("WRITER_PROVIDER_FAILED", true); throw new WriterProviderError("WRITER_PROVIDER_FAILED", false); }
      const payload = await response.json() as DeepSeekResponse; const rawText = text(payload.choices?.[0]?.message?.content); if (!rawText) throw new WriterProviderError("WRITER_EMPTY_RESPONSE", false);
      return { rawText, providerResponseId: text(payload.id), resolvedModel: text(payload.model) ?? request.requestedModel ?? this.model, tokenUsage: { inputTokens: count(payload.usage?.prompt_tokens), outputTokens: count(payload.usage?.completion_tokens), totalTokens: count(payload.usage?.total_tokens) } };
    } catch (error) { if (error instanceof WriterProviderError) throw error; if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new WriterProviderError("WRITER_TIMEOUT", true); throw new WriterProviderError("WRITER_PROVIDER_FAILED", true); } finally { clearTimeout(timer); }
  }
}
export class MockWriterProvider implements WriterModelProvider { readonly provider = "mock"; public calls = 0; constructor(private readonly resolve: (request: WriterProviderRequest) => Promise<WriterProviderResult> | WriterProviderResult) {} async generate(request: WriterProviderRequest) { this.calls += 1; return this.resolve(request); } }
export function createDeepSeekWriterProviderFromEnvironment() { if ((process.env.AI_PROVIDER?.trim() || "deepseek") !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) throw new WriterProviderError("WRITER_NOT_CONFIGURED", false); return new DeepSeekWriterProvider({ apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_WRITER_MODEL || process.env.DEEPSEEK_PLANNER_MODEL, baseUrl: process.env.DEEPSEEK_BASE_URL }); }
export function getConfiguredWriterModel() { return process.env.DEEPSEEK_WRITER_MODEL?.trim() || process.env.DEEPSEEK_PLANNER_MODEL?.trim() || "deepseek-v4-flash"; }
