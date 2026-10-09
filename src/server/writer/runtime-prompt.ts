import { createHash } from "node:crypto";

import { createWriterInputFingerprint, type WriterInput } from "@/server/writer/contracts";
import {
  getWriterPromptDefinition,
  readWriterPromptSource,
  type WriterPromptDefinition,
} from "@/server/writer/prompt-registry";

// Compatibility aliases for the existing strategy Writer tests and metadata readers.
export const WRITER_PROMPT_VERSION = "writer-strategy-section-v1";
export const WRITER_PROMPT_SOURCE = "docs/prompts/writer/strategy-writer-prompt-v1.md";
export const WRITER_PARENT_PROMPT_VERSION = "strategy-writer-prompt-v1";

function extractWriterBusinessSections(source: string): string {
  const canonical = `${source.replace(/\r\n?/g, "\n").trimEnd()}\n`;
  const boundary = [canonical.indexOf("\n# Examples"), canonical.indexOf("\n# Output")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return (boundary === undefined ? canonical : canonical.slice(0, boundary)).trimEnd();
}

function createWriterOutputExample(input: WriterInput, requireStrategyMapping: boolean): string {
  return JSON.stringify({
    chapterNodeId: input.target.chapterNodeId,
    sectionNodeId: input.target.sectionNodeId,
    sectionTitle: input.target.sectionTitle,
    contentMarkdown: "当前子节正文；仅基于已采用资料撰写。",
    strategyMapping: requireStrategyMapping
      ? [{ problem: "已确认问题", evidence: ["资料依据"], strategy: "对应策略", measures: ["可执行措施"] }]
      : [],
    sourceUsed: input.adoptedMaterials.slice(0, 1).map((material) => material.materialId),
    missingInfo: [],
    humanConfirmation: [],
    sectionSummary: "当前子节摘要。",
  }, null, 2);
}

export function buildWriterRuntimePromptFromSource(
  source: string,
  input: WriterInput,
  definition: WriterPromptDefinition = getWriterPromptDefinition(input.target.writerType),
) {
  const canonical = extractWriterBusinessSections(source);
  const strategyRule = definition.requireStrategyMapping
    ? "`strategyMapping` 至少包含一项，并保持原文要求的“问题—目标—策略—措施”逻辑。"
    : "`strategyMapping` 必须返回空数组；原文中的专业结构化内容应完整转写到 `contentMarkdown`，不得丢失。";
  const prompt = `${canonical}

# Runtime Engineering

以上 Markdown 原文是当前 \`${definition.writerType}\` Writer 的唯一业务逻辑来源，不重写其角色、流程、专业规则或边界。

本次工程化仅执行以下调整：

- 只编制 activeConfirmedVersion 中由 \`chapterNodeId\` 和 \`sectionNodeId\` 指定的当前子节。
- 当前写作类型为 \`${definition.writerType}\`，适用范围：${definition.sectionScope}。
- 字段映射：${definition.fieldMapping}
- 不得生成其他子节，不得修改方案结构、章节名称、项目名称或项目定位。
- 若 \`predecessorContext\` 非空，只使用其中的摘要和必要事实衔接当前子节，不发送、复述或扩写前置子节全文。
- predecessorContext.basis 为 confirmed 时可作为已确认衔接依据。
- 若 \`predecessorContext.basis\` 为 \`provisional\`，不得将暂定上下文表述为已确认事实，相关不确定内容写入 \`missingInfo\` 或 \`humanConfirmation\`。

<section_input_json>
${JSON.stringify(input, null, 2)}
</section_input_json>

只返回一个合法 JSON 对象，不得包含 Markdown 代码围栏或额外说明。字段严格为：

- \`chapterNodeId\`
- \`sectionNodeId\`
- \`sectionTitle\`
- \`contentMarkdown\`
- \`strategyMapping\`
- \`sourceUsed\`
- \`missingInfo\`
- \`humanConfirmation\`
- \`sectionSummary\`

严格按下面的 camelCase JSON 结构返回；不得使用旧示例中的 snake_case 字段名：

<writer_output_example>
${createWriterOutputExample(input, definition.requireStrategyMapping)}
</writer_output_example>

输出约束：

- 三个目标标识字段必须与 \`section_input_json.target\` 完全一致。
- \`sourceUsed\` 只能引用 \`section_input_json.adoptedMaterials\` 中已有的 \`materialId\`。
- \`contentMarkdown\` 只能是当前子节正文。
- \`sectionSummary\` 是当前子节摘要，对应原文的 \`chapter_summary\`。
- 缺失事实不得编造，写入 \`missingInfo\`；需要专业判断的内容写入 \`humanConfirmation\`。
- ${strategyRule}
`;
  return {
    prompt,
    inputFingerprint: createWriterInputFingerprint(input),
    definition,
    metadata: {
      promptVersion: definition.promptVersion,
      promptSource: definition.promptSource,
      parentPromptVersion: definition.parentPromptVersion,
      contentHash: createHash("sha256").update(prompt, "utf8").digest("hex"),
    },
  };
}

export async function createWriterRuntimePrompt(input: WriterInput) {
  const definition = getWriterPromptDefinition(input.target.writerType);
  const source = await readWriterPromptSource(input.target.writerType);
  return buildWriterRuntimePromptFromSource(source, input, definition);
}
