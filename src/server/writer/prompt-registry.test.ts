import { describe, expect, it } from "vitest";

import { validateProjectDocument } from "@/domain/projects/schema";
import {
  WRITER_TYPES,
  WRITER_TYPE_LABELS,
  suggestWriterTypeFromTitle,
} from "@/domain/writer/writer-types";
import {
  createDependencyFixtureProject,
  DEPENDENCY_CHAPTER_ID,
  DEPENDENT_SECTION_ID,
  PREDECESSOR_SECTION_ID,
} from "@/server/dependencies/test-fixture";
import { validatePlannerOutput } from "@/server/planner/contracts";
import { buildWriterContext } from "@/server/writer/context-builder";
import {
  WRITER_PROMPT_REGISTRY,
  readWriterPromptSource,
} from "@/server/writer/prompt-registry";
import { buildWriterRuntimePromptFromSource } from "@/server/writer/runtime-prompt";

describe("Writer Prompt registry", () => {
  it("registers the four Writer types against distinct Markdown business sources", async () => {
    expect(Object.keys(WRITER_PROMPT_REGISTRY)).toEqual(WRITER_TYPES);
    expect(new Set(Object.values(WRITER_PROMPT_REGISTRY).map((item) => item.promptSource)).size).toBe(4);

    for (const writerType of WRITER_TYPES) {
      const definition = WRITER_PROMPT_REGISTRY[writerType];
      const source = await readWriterPromptSource(writerType);
      expect(definition.writerType).toBe(writerType);
      expect(definition.promptSource).toMatch(/^docs\/prompts\/writer\/.+-prompt-v1\.md$/);
      expect(source).toContain("# Role");
      expect(source).toContain("# Constraints");
    }
  });

  it("selects the runtime source from the confirmed section writerType", async () => {
    const project = createDependencyFixtureProject();
    const context = buildWriterContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    for (const writerType of WRITER_TYPES) {
      const input = {
        ...context.input,
        target: { ...context.input.target, writerType },
      };
      const definition = WRITER_PROMPT_REGISTRY[writerType];
      const source = await readWriterPromptSource(writerType);
      const runtime = buildWriterRuntimePromptFromSource(source, input, definition);
      expect(runtime.definition.writerType).toBe(writerType);
      expect(runtime.metadata.promptSource).toBe(definition.promptSource);
      expect(runtime.prompt).toContain("# Role");
      expect(runtime.prompt).toContain("# Constraints");
      expect(runtime.prompt).not.toContain("# Examples");
      expect(runtime.prompt).not.toContain("# Output");
      expect(runtime.prompt).toContain(`当前写作类型为 \`${writerType}\``);
    }
  });

  it("keeps title matching auxiliary and leaves ambiguous titles unconfirmed", () => {
    expect(suggestWriterTypeFromTitle("产业发展策略")).toBe("strategy_solution");
    expect(suggestWriterTypeFromTitle("综合专题")).toBeNull();
    expect(WRITER_TYPE_LABELS.strategy_solution).toContain("策略");
  });

  it("accepts legacy Planner data but requires writerType from new model output", () => {
    const project = createDependencyFixtureProject();
    const output = project.plannerOutline.confirmedVersions[0].content;
    const legacy = structuredClone(output) as unknown as {
      chapters: Array<{ sections: Array<Record<string, unknown>> }>;
    };
    for (const chapter of legacy.chapters) {
      for (const section of chapter.sections) delete section.writerType;
    }
    expect(validatePlannerOutput(legacy).ok).toBe(true);
    expect(validatePlannerOutput(legacy, undefined, { requireWriterType: true })).toEqual({
      ok: false,
      error: "PLANNER_OUTPUT_INVALID",
    });
    expect(validatePlannerOutput(output, undefined, { requireWriterType: true }).ok).toBe(true);

    const unresolved = structuredClone(output);
    unresolved.chapters[0].sections[0].writerType = null;
    expect(validatePlannerOutput(unresolved, undefined, { requireWriterType: true }).ok).toBe(false);
    unresolved.professionalConfirmations.push({
      itemId: "confirm_writer_type",
      title: "待确认写作类型",
      reason: "当前任务无法可靠归类。",
      relatedNodeIds: [unresolved.chapters[0].sections[0].nodeId],
    });
    expect(validatePlannerOutput(unresolved, undefined, { requireWriterType: true }).ok).toBe(true);
  });

  it("maps only legacy sections with existing Writer state to strategy_solution", () => {
    const legacy = createDependencyFixtureProject();
    for (const version of legacy.plannerOutline.confirmedVersions) {
      for (const chapter of version.content.chapters) {
        for (const section of chapter.sections) {
          delete (section as Partial<typeof section>).writerType;
        }
        const explicitlyTyped = chapter.sections.find((section) => section.nodeId === DEPENDENT_SECTION_ID);
        if (explicitlyTyped) explicitlyTyped.writerType = "fact_analysis";
      }
    }
    const result = validateProjectDocument(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sections = result.value.plannerOutline.confirmedVersions[0].content.chapters[0].sections;
    expect(sections.find((item) => item.nodeId === PREDECESSOR_SECTION_ID)?.writerType).toBe("strategy_solution");
    expect(sections.find((item) => item.nodeId === DEPENDENT_SECTION_ID)?.writerType).toBe("fact_analysis");
  });

  it("blocks Writer generation context while an explicit type is still pending", () => {
    const project = createDependencyFixtureProject();
    const section = project.plannerOutline.confirmedVersions[0].content.chapters[0].sections
      .find((item) => item.nodeId === DEPENDENT_SECTION_ID);
    expect(section).toBeDefined();
    if (!section) return;
    section.writerType = null;
    expect(buildWriterContext(project, DEPENDENCY_CHAPTER_ID, DEPENDENT_SECTION_ID)).toEqual({
      ok: false,
      error: "WRITER_INPUT_INSUFFICIENT",
      blockingMissing: ["待确认写作类型"],
    });
  });
});
