import { describe, expect, it } from "vitest";

import {
  DeepSeekPlannerProvider,
  PlannerProviderError,
} from "@/server/planner/model-provider";

const request = { prompt: "只输出 JSON", requestedModel: "deepseek-v4-flash", timeoutMs: 100 };

describe("DeepSeekPlannerProvider", () => {
  it("maps a non-streaming JSON response without exposing configuration", async () => {
    const calls: RequestInit[] = [];
    const provider = new DeepSeekPlannerProvider({
      apiKey: "test-key",
      fetchImplementation: async (_, init) => {
        calls.push(init ?? {});
        return new Response(JSON.stringify({
          id: "chat_123", model: "deepseek-v4-flash",
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }), { status: 200 });
      },
    });
    await expect(provider.generate(request)).resolves.toEqual({
      rawText: '{"ok":true}', providerResponseId: "chat_123", resolvedModel: "deepseek-v4-flash",
      tokenUsage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
    });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body as string)).toMatchObject({
      model: "deepseek-v4-flash", stream: false, thinking: { type: "disabled" }, max_tokens: 4096, temperature: 0.2, response_format: { type: "json_object" },
    });
  });

  it("normalizes empty content, rate limits and server failures", async () => {
    const empty = new DeepSeekPlannerProvider({ apiKey: "test-key", fetchImplementation: async () => new Response(JSON.stringify({ choices: [{ message: { content: " " } }] })) });
    await expect(empty.generate(request)).rejects.toMatchObject({ code: "PLANNER_EMPTY_RESPONSE", retryable: false } satisfies Partial<PlannerProviderError>);
    const limited = new DeepSeekPlannerProvider({ apiKey: "test-key", fetchImplementation: async () => new Response("", { status: 429 }) });
    await expect(limited.generate(request)).rejects.toMatchObject({ code: "PLANNER_RATE_LIMITED", retryable: true } satisfies Partial<PlannerProviderError>);
    const unavailable = new DeepSeekPlannerProvider({ apiKey: "test-key", fetchImplementation: async () => new Response("", { status: 503 }) });
    await expect(unavailable.generate(request)).rejects.toMatchObject({ code: "PLANNER_PROVIDER_FAILED", retryable: true } satisfies Partial<PlannerProviderError>);
  });
});
