import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { demoProject } from "@/domain/projects/demo-project";
import {
  PLANNER_OUTPUT_JSON_SCHEMA,
  PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME,
} from "@/server/planner/contracts";
import { buildPlannerContext } from "@/server/planner/context-builder";
import {
  buildPlannerRuntimePromptFromSource,
  canonicalizePromptSource,
  createPlannerRuntimePrompt,
  PLANNER_PARENT_PROMPT_VERSION,
  PLANNER_PROMPT_SOURCE,
  PLANNER_PROMPT_VERSION,
} from "@/server/planner/runtime-prompt";

function extractSection(
  source: string,
  heading: string,
  nextHeading: string,
): string {
  const start = source.indexOf(`# ${heading}`);
  const end = source.indexOf(`# ${nextHeading}`, start);
  if (start < 0 || end < 0) throw new Error(`Missing source section: ${heading}`);
  return source.slice(start, end).trim();
}

function expectStrictObjectSchemas(schema: unknown): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return;
  }
  const record = schema as Record<string, unknown>;
  if (record.type === "object") {
    const properties = record.properties as Record<string, unknown>;
    expect(record.additionalProperties).toBe(false);
    expect(new Set(record.required as string[])).toEqual(
      new Set(Object.keys(properties)),
    );
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) value.forEach(expectStrictObjectSchemas);
    else expectStrictObjectSchemas(value);
  }
}

describe("Planner runtime prompt", () => {
  it("preserves the approved role, workflow, and constraints verbatim", async () => {
    const source = await readFile(
      path.join(process.cwd(), ...PLANNER_PROMPT_SOURCE.split("/")),
      "utf8",
    );
    const context = buildPlannerContext(demoProject);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    const runtime = buildPlannerRuntimePromptFromSource(source, context.input);

    expect(runtime.prompt).toContain(
      canonicalizePromptSource(extractSection(source, "Role", "Goal")).trim(),
    );
    expect(runtime.prompt).toContain(
      canonicalizePromptSource(
        extractSection(source, "Workflow", "Constraints"),
      ).trim(),
    );
    expect(runtime.prompt).toContain(
      canonicalizePromptSource(
        extractSection(source, "Constraints", "Examples"),
      ).trim(),
    );
    expect(runtime.prompt).not.toContain("# Examples");
    expect(runtime.prompt).not.toContain("某市A村总体发展规划");
    expect(runtime.prompt).not.toContain('"total_chapters"');
    expect(runtime.prompt).toContain("generationBasis.materialId");
    expect(runtime.prompt).toContain("中的资料不可作为生成依据或所需资料来源");
  });

  it("binds dynamic input and strict Structured Output without placeholders", async () => {
    const context = buildPlannerContext(demoProject);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    const runtime = await createPlannerRuntimePrompt(context.input);

    expect(runtime.prompt).not.toContain("{{PLANNER_INPUT_JSON}}");
    expect(runtime.prompt).not.toContain("{{PLANNER_OUTPUT_JSON_SCHEMA}}");
    expect(runtime.prompt).toContain(`"projectId": "a-village"`);
    expect(runtime.structuredOutput).toEqual({
      name: PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME,
      strict: true,
      schema: PLANNER_OUTPUT_JSON_SCHEMA,
    });
    expectStrictObjectSchemas(PLANNER_OUTPUT_JSON_SCHEMA);
  });

  it("records source lineage, content hash, and the same input fingerprint", async () => {
    const context = buildPlannerContext(demoProject);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    const runtime = await createPlannerRuntimePrompt(context.input);

    expect(runtime.metadata).toEqual({
      promptVersion: PLANNER_PROMPT_VERSION,
      promptSource: PLANNER_PROMPT_SOURCE,
      parentPromptVersion: PLANNER_PARENT_PROMPT_VERSION,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(runtime.inputFingerprint).toBe(context.inputFingerprint);
  });
});
