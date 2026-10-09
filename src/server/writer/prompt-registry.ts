import { readFile } from "node:fs/promises";
import path from "node:path";

import type { WriterType } from "@/domain/writer/writer-types";

export type WriterPromptDefinition = {
  writerType: WriterType;
  promptVersion: string;
  promptSource: string;
  parentPromptVersion: string;
  sectionScope: string;
  fieldMapping: string;
  requireStrategyMapping: boolean;
};

export const WRITER_PROMPT_REGISTRY: Record<WriterType, WriterPromptDefinition> = {
  fact_analysis: {
    writerType: "fact_analysis",
    promptVersion: "writer-fact-analysis-section-v1",
    promptSource: "docs/prompts/writer/fact-analysis-writer-prompt-v1.md",
    parentPromptVersion: "fact-analysis-writer-prompt-v1",
    sectionScope: "事实归纳、项目概况或现状分析型子节",
    fieldMapping: "chapter_task 映射为 section_task；chapter_id/chapter_title/chapter_summary 映射为 chapterNodeId/sectionTitle/sectionSummary；strategyMapping 固定为空数组。",
    requireStrategyMapping: false,
  },
  strategy_solution: {
    writerType: "strategy_solution",
    promptVersion: "writer-strategy-section-v1",
    promptSource: "docs/prompts/writer/strategy-writer-prompt-v1.md",
    parentPromptVersion: "strategy-writer-prompt-v1",
    sectionScope: "发展研判、总体定位、规划策略或建设方案型子节",
    fieldMapping: "chapter_task 映射为 section_task；chapter_id/chapter_title/chapter_summary 映射为 chapterNodeId/sectionTitle/sectionSummary；strategy_mapping 映射为 strategyMapping。",
    requireStrategyMapping: true,
  },
  spatial_design: {
    writerType: "spatial_design",
    promptVersion: "writer-spatial-design-section-v1",
    promptSource: "docs/prompts/writer/spatial-design-writer-prompt-v1.md",
    parentPromptVersion: "spatial-design-writer-prompt-v1",
    sectionScope: "空间布局、重点片区、项目布局、基础设施或建设指引型子节",
    fieldMapping: "chapter_task 映射为 section_task；chapter_id/chapter_title/chapter_summary 映射为 chapterNodeId/sectionTitle/sectionSummary；spatial_plan 的专业内容完整写入 contentMarkdown，strategyMapping 固定为空数组。",
    requireStrategyMapping: false,
  },
  action_plan: {
    writerType: "action_plan",
    promptVersion: "writer-action-plan-section-v1",
    promptSource: "docs/prompts/writer/action-plan-writer-prompt-v1.md",
    parentPromptVersion: "action-plan-writer-prompt-v1",
    sectionScope: "行动计划、实施保障、分期安排或项目清单型子节",
    fieldMapping: "chapter_task 映射为 section_task；chapter_id/chapter_title/chapter_summary 映射为 chapterNodeId/sectionTitle/sectionSummary；action_plan 和 project_list 的专业内容完整写入 contentMarkdown，strategyMapping 固定为空数组。",
    requireStrategyMapping: false,
  },
};

export function getWriterPromptDefinition(writerType: WriterType): WriterPromptDefinition {
  return WRITER_PROMPT_REGISTRY[writerType];
}

export async function readWriterPromptSource(writerType: WriterType): Promise<string> {
  switch (writerType) {
    case "fact_analysis":
      return readFile(path.join(process.cwd(), "docs", "prompts", "writer", "fact-analysis-writer-prompt-v1.md"), "utf8");
    case "strategy_solution":
      return readFile(path.join(process.cwd(), "docs", "prompts", "writer", "strategy-writer-prompt-v1.md"), "utf8");
    case "spatial_design":
      return readFile(path.join(process.cwd(), "docs", "prompts", "writer", "spatial-design-writer-prompt-v1.md"), "utf8");
    case "action_plan":
      return readFile(path.join(process.cwd(), "docs", "prompts", "writer", "action-plan-writer-prompt-v1.md"), "utf8");
  }
}
