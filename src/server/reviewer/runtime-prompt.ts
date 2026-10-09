import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createReviewInputFingerprint, type ReviewerInput } from "@/server/reviewer/contracts";

export const REVIEWER_PROMPT_VERSION = "reviewer-section-v1";
export const REVIEWER_PROMPT_SOURCE = "docs/prompts/reviewer/reviewer-prompt-v1.md";
export const REVIEWER_PARENT_PROMPT_VERSION = "reviewer-prompt-v1";

export function buildReviewerRuntimePromptFromSource(source: string, input: ReviewerInput) {
  const canonical = `${source.replace(/\r\n?/g, "\n").trimEnd()}\n`;
  const prompt = `${canonical}

# Runtime Engineering

以上原文是不可改变的业务逻辑来源。本次 review_scope 仅为当前子节，不得校核、生成或修改其他章节，不得修改方案结构，也不得直接重写正文。

原文业务字段映射如下：
- 格式合规性 -> structure_format（结构与格式）
- 内容完整性 -> content_coverage（内容覆盖）
- 数据准确性 -> facts_evidence（事实与依据）
- 逻辑一致性 -> coherence（前后衔接）
- 语言质量 -> professional_expression（专业表达）
- critical -> must_fix（必须处理）
- minor -> suggestion（建议优化）
- human_confirmation -> professional_confirmation（待专业确认）

必须处理只用于明确、可验证且会阻碍成果成立的问题。表达偏好或轻微改进属于建议优化。无法从资料验证的专业判断属于待专业确认。referenceOnlyMaterials 只能作为结构和方法参考，不能作为当前项目事实。
当正文包含专业预测、专业参数、规模判断或效果承诺，且 adoptedFacts 中没有可验证依据、需要规划设计人员进行专业判断时，必须逐项生成 type=professional_confirmation 的独立问题；严禁归类为 suggestion，也不得仅写入维度摘要或 reviewSummary。
当 previousConfirmedSummaries 非空时，必须检查当前正文与前置已确认摘要中的项目名称、关键事实、目标、策略和措施是否一致。明确冲突归入 facts_evidence 或 coherence，并在问题依据中标记“前置确认内容”；不得扩写或重新校核前置正文。

<review_input_json>
${JSON.stringify(input, null, 2)}
</review_input_json>

只返回一个合法 JSON 对象，字段严格为：
{
  "reviewResult": "pass | revise",
  "dimensionResults": [
    { "dimension": "structure_format | content_coverage | facts_evidence | coherence | professional_expression", "status": "pass | warning | fail", "summary": "..." }
  ],
  "issues": [
    {
      "dimension": "...",
      "type": "must_fix | suggestion | professional_confirmation",
      "location": "...",
      "problem": "...",
      "evidence": "...",
      "impact": "...",
      "suggestion": "..."
    }
  ],
  "reviewSummary": "..."
}

dimensionResults 必须且只能包含五个维度各一次。有 must_fix 时 reviewResult 必须为 revise；没有 must_fix 时必须为 pass。不得返回修改后的正文。`;
  return {
    prompt,
    inputFingerprint: createReviewInputFingerprint(input),
    metadata: {
      promptVersion: REVIEWER_PROMPT_VERSION,
      promptSource: REVIEWER_PROMPT_SOURCE,
      parentPromptVersion: REVIEWER_PARENT_PROMPT_VERSION,
      contentHash: createHash("sha256").update(prompt, "utf8").digest("hex"),
    },
  };
}

export async function createReviewerRuntimePrompt(input: ReviewerInput) {
  const source = await readFile(path.join(process.cwd(), "docs", "prompts", "reviewer", "reviewer-prompt-v1.md"), "utf8");
  return buildReviewerRuntimePromptFromSource(source, input);
}
