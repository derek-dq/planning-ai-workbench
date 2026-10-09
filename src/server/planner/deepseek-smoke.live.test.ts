import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  createDeepSeekPlannerProviderFromEnvironment,
  getConfiguredPlannerModel,
} from "@/server/planner/model-provider";
import type {
  PlannerModelProvider,
  PlannerProviderRequest,
  PlannerProviderResult,
} from "@/server/planner/model-provider";
import { PlannerOutlineService } from "@/server/planner/planner-service";
import { ProjectRepository } from "@/server/projects/project-repository";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planning-ai-deepseek-smoke-"));

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("DeepSeek Planner live smoke test", () => {
  it("generates a valid dynamic suggestion for the isolated a-village fixture", async () => {
    if (process.env.AI_PROVIDER !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
      throw new Error("Set AI_PROVIDER=deepseek and DEEPSEEK_API_KEY before running this live smoke test.");
    }
    const deepSeekProvider = createDeepSeekPlannerProviderFromEnvironment();
    const latestResponse: { value: PlannerProviderResult | null } = { value: null };
    const provider: PlannerModelProvider = {
      provider: deepSeekProvider.provider,
      async generate(request: PlannerProviderRequest) {
        latestResponse.value = await deepSeekProvider.generate(request);
        return latestResponse.value;
      },
    };
    const service = new PlannerOutlineService(
      new ProjectRepository({ dataRoot: temporaryRoot }),
      provider,
      getConfiguredPlannerModel(),
    );
    let suggestion;
    try {
      suggestion = await service.generateLatestSuggestion("a-village");
    } catch (error) {
      const output = latestResponse.value?.rawText;
      let parsedSummary: Record<string, unknown> = { jsonParsed: false };
      try {
        const parsed = JSON.parse(output ?? "") as Record<string, unknown>;
        parsedSummary = {
          jsonParsed: true,
          topLevelKeys: Object.keys(parsed).sort(),
          chapterCount: Array.isArray(parsed.chapters) ? parsed.chapters.length : null,
          missingMaterialsCount: Array.isArray(parsed.missingMaterials) ? parsed.missingMaterials.length : null,
          professionalConfirmationsCount: Array.isArray(parsed.professionalConfirmations) ? parsed.professionalConfirmations.length : null,
        };
      } catch { /* only emit structure, never raw model text */ }
      console.info("PLANNER_SMOKE_SAFE_DIAGNOSTIC", JSON.stringify({
        errorCode: error instanceof Error ? error.message : "UNKNOWN",
        rawLength: output?.length ?? null,
        ...parsedSummary,
      }));
      throw error;
    }
    expect(suggestion.provider).toBe("deepseek");
    expect(suggestion.content.chapters.length).toBeGreaterThan(0);
    expect(suggestion.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  }, 130_000);
});
