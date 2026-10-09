import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { CASE_001_PROJECT_ID, createCase001Project } from "@/server/evaluation/case-001.fixture";
import {
  createDeepSeekPlannerProviderFromEnvironment,
  getConfiguredPlannerModel,
} from "@/server/planner/model-provider";
import { PlannerOutlineService } from "@/server/planner/planner-service";
import { ProjectRepository } from "@/server/projects/project-repository";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planning-ai-case-001-"));

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("Case-001 Planner live evaluation", () => {
  it("creates a source-bounded outline from the redacted case package", async () => {
    if (process.env.AI_PROVIDER !== "deepseek" || !process.env.DEEPSEEK_API_KEY?.trim()) {
      throw new Error("Set AI_PROVIDER=deepseek and DEEPSEEK_API_KEY before running this live evaluation.");
    }
    const itemsDirectory = path.join(temporaryRoot, "items");
    await mkdir(itemsDirectory, { recursive: true });
    await writeFile(path.join(itemsDirectory, `${CASE_001_PROJECT_ID}.json`), `${JSON.stringify(createCase001Project(), null, 2)}\n`, "utf8");

    const service = new PlannerOutlineService(
      new ProjectRepository({ dataRoot: temporaryRoot }),
      createDeepSeekPlannerProviderFromEnvironment(),
      getConfiguredPlannerModel(),
    );
    const suggestion = await service.generateLatestSuggestion(CASE_001_PROJECT_ID);
    const allowedMaterialIds = new Set(createCase001Project().materials.map((material) => material.materialId));

    expect(suggestion.provider).toBe("deepseek");
    expect(suggestion.content.chapters).toHaveLength(3);
    expect(suggestion.content.chapters.every((chapter) => chapter.sections.length === 2)).toBe(true);
    expect(suggestion.content.chapters.flatMap((chapter) => [chapter, ...chapter.sections])
      .flatMap((node) => node.generationBasis)
      .every((basis) => allowedMaterialIds.has(basis.materialId))).toBe(true);
    expect(suggestion.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  }, 130_000);
});
