import { describe, expect, it } from "vitest";

import { DeepSeekReviewerProvider, ReviewerProviderError } from "@/server/reviewer/model-provider";

const request = { prompt: "review", requestedModel: "mock-model", timeoutMs: 500 };

describe("DeepSeekReviewerProvider", () => {
  it("uses injected fetch and normalizes metadata without real network access", async () => {
    let authorization = "";
    let requestBody: Record<string, unknown> = {};
    const provider = new DeepSeekReviewerProvider({
      apiKey: "test-secret",
      fetchImplementation: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        requestBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return new Response(JSON.stringify({
          id: "review_1",
          model: "resolved-model",
          choices: [{ message: { content: "{\"ok\":true}" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }));
      },
    });
    await expect(provider.generate(request)).resolves.toEqual({
      rawText: "{\"ok\":true}",
      providerResponseId: "review_1",
      resolvedModel: "resolved-model",
      tokenUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
    expect(authorization).toBe("Bearer test-secret");
    expect(requestBody).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 4096, temperature: 0.2, response_format: { type: "json_object" } });
  });

  it("maps rate limits and empty responses to stable errors", async () => {
    const limited = new DeepSeekReviewerProvider({
      apiKey: "test",
      fetchImplementation: async () => new Response("", { status: 429 }),
    });
    await expect(limited.generate(request)).rejects.toEqual(new ReviewerProviderError("REVIEWER_RATE_LIMITED", true));
    const empty = new DeepSeekReviewerProvider({
      apiKey: "test",
      fetchImplementation: async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })),
    });
    await expect(empty.generate(request)).rejects.toEqual(new ReviewerProviderError("REVIEWER_EMPTY_RESPONSE", true));
  });
});
