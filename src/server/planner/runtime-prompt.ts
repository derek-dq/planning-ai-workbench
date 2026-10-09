import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PLANNER_OUTPUT_JSON_SCHEMA,
  PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME,
  validatePlannerInput,
  type PlannerInput,
} from "@/server/planner/contracts";
import { createInputFingerprint } from "@/server/planner/context-builder";

export const PLANNER_PROMPT_VERSION = "planner-outline-v1";
export const PLANNER_PROMPT_SOURCE = "docs/prompts/planner/prompt-v1.md";
export const PLANNER_PARENT_PROMPT_VERSION = "planner-v1";

export type PlannerPromptMetadata = {
  promptVersion: typeof PLANNER_PROMPT_VERSION;
  promptSource: typeof PLANNER_PROMPT_SOURCE;
  parentPromptVersion: typeof PLANNER_PARENT_PROMPT_VERSION;
  contentHash: string;
};

export type PlannerRuntimePrompt = {
  prompt: string;
  metadata: PlannerPromptMetadata;
  inputFingerprint: string;
  structuredOutput: {
    name: typeof PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME;
    strict: true;
    schema: typeof PLANNER_OUTPUT_JSON_SCHEMA;
  };
};

const INPUT_PLACEHOLDER = "{{PLANNER_INPUT_JSON}}";
const OUTPUT_SCHEMA_PLACEHOLDER = "{{PLANNER_OUTPUT_JSON_SCHEMA}}";

export function canonicalizePromptSource(source: string): string {
  return `${source.replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

export function createPromptContentHash(source: string): string {
  return createHash("sha256")
    .update(canonicalizePromptSource(source), "utf8")
    .digest("hex");
}

function createRuntimeTemplate(source: string): string {
  const canonicalSource = canonicalizePromptSource(source);
  const businessSections = [
    extractSourceSection(canonicalSource, "Role", "Goal"),
    extractSourceSection(canonicalSource, "Goal", "Input"),
    extractSourceSection(canonicalSource, "Input", "Workflow"),
    extractSourceSection(canonicalSource, "Workflow", "Constraints"),
    extractSourceSection(canonicalSource, "Constraints", "Examples"),
  ].join("\n\n");

  return `${businessSections}

# Runtime Engineering

以下内容只用于把已确认的业务 Prompt 接入当前系统，不改变以上角色、目标、流程和约束。

## Dynamic Input

下方 JSON 是本次运行唯一的当前项目输入。project、factMaterials、referenceMaterials、userSupplementalRequirements 分别承载原文 Input 中可由当前项目提供的信息；未提供的字段视为缺失，不得推断或编造。

- factMaterials 是当前项目可采信事实资料。
- referenceMaterials 只可提供结构与方法参考，不得作为当前项目事实。
- unavailableMaterialNotices 不含不可采信摘要，只用于识别资料状态。
- knownMissingMaterials 和 pendingProfessionalConfirmations 必须在输出中保留或合并，不得删除。

<planner_input_json>
${INPUT_PLACEHOLDER}
</planner_input_json>

## Structured Output

提供商应启用其支持的最强 JSON 输出能力。使用名称 \`${PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME}\` 和下方 JSON Schema 约束字段命名与层级；其作用仅是把原文要求的目录、章节任务、资料来源、依赖、缺失信息和人工确认事项工程化。不得输出 Schema 之外的字段，不得输出章节正文，最终只输出合法 JSON。系统会在收到响应后再次执行 JSON Schema 和业务规则校验。

## Output Reference Rules

- 本次为 P0 目录与任务链路验证：严格输出 3 个章节，每章严格输出 2 个子节；不得撰写章节正文。
- 每个章节或子节的 ‘keyPoints’ 至多 2 项，‘requiredMaterials’、‘prerequisiteNotes’ 与 ‘generationBasis’ 各至多 2 项；‘missingMaterials’ 与 ‘professionalConfirmations’ 各至多 4 项。
- 所有标题、purpose、reason 与 keyPoints 均使用简洁短句，单项不超过 60 个中文字符；不得为了完整性重复解释同一项资料或规则。
- \`generationBasis.materialId\` 和 \`requiredMaterials.sourceMaterialIds\` 只能引用 \`factMaterials\` 或 \`referenceMaterials\` 中已出现的 \`materialId\`。
- \`unavailableMaterialNotices\` 中的资料不可作为生成依据或所需资料来源；相关缺口应写入 \`missingMaterials\` 或 \`professionalConfirmations\`。
- 所有 \`nodeId\` 必须唯一；\`prerequisiteNodeIds\` 只能引用本次输出中已存在的其他节点，且不得自引用或形成循环。
- 每个子节必须给出 \`writerType\` 建议：事实归纳与现状分析使用 \`fact_analysis\`，发展研判与策略方案使用 \`strategy_solution\`，空间布局与建设设计使用 \`spatial_design\`，行动计划与项目清单使用 \`action_plan\`。
- \`writerType\` 必须根据子节任务、编制重点、输入资料和预期成果综合判断，不得只根据章节编号。标题只能作为辅助线索。
- 无法可靠判断时，\`writerType\` 输出 \`null\`，并在 \`professionalConfirmations\` 中增加关联该子节的“待确认写作类型”事项，不得静默猜测。

<planner_output_json_schema>
${OUTPUT_SCHEMA_PLACEHOLDER}
</planner_output_json_schema>
`;
}

function extractSourceSection(
  source: string,
  heading: string,
  nextHeading: string,
): string {
  const start = source.indexOf(`# ${heading}`);
  const end = source.indexOf(`# ${nextHeading}`, start);
  if (start < 0 || end < 0) {
    throw new Error(`Planner Prompt source is missing section: ${heading}.`);
  }
  return source.slice(start, end).trim();
}

export function buildPlannerRuntimePromptFromSource(
  source: string,
  input: PlannerInput,
): PlannerRuntimePrompt {
  const validation = validatePlannerInput(input);
  if (!validation.ok) {
    throw new Error("Cannot build a runtime prompt from invalid Planner input.");
  }

  const prompt = createRuntimeTemplate(source)
    .replace(INPUT_PLACEHOLDER, JSON.stringify(validation.value, null, 2))
    .replace(
      OUTPUT_SCHEMA_PLACEHOLDER,
      JSON.stringify(PLANNER_OUTPUT_JSON_SCHEMA, null, 2),
    );

  return {
    prompt,
    metadata: {
      promptVersion: PLANNER_PROMPT_VERSION,
      promptSource: PLANNER_PROMPT_SOURCE,
      parentPromptVersion: PLANNER_PARENT_PROMPT_VERSION,
      contentHash: createPromptContentHash(source),
    },
    inputFingerprint: createInputFingerprint(validation.value),
    structuredOutput: {
      name: PLANNER_STRUCTURED_OUTPUT_SCHEMA_NAME,
      strict: true,
      schema: PLANNER_OUTPUT_JSON_SCHEMA,
    },
  };
}

export async function createPlannerRuntimePrompt(
  input: PlannerInput,
): Promise<PlannerRuntimePrompt> {
  const sourcePath = path.join(
    process.cwd(),
    "docs",
    "prompts",
    "planner",
    "prompt-v1.md",
  );
  const source = await readFile(sourcePath, "utf8");
  return buildPlannerRuntimePromptFromSource(source, input);
}
