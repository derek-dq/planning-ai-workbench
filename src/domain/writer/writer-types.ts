export const WRITER_TYPES = [
  "fact_analysis",
  "strategy_solution",
  "spatial_design",
  "action_plan",
] as const;

export type WriterType = (typeof WRITER_TYPES)[number];

export const WRITER_TYPE_LABELS: Record<WriterType, string> = {
  fact_analysis: "事实归纳与现状分析",
  strategy_solution: "发展研判与策略方案",
  spatial_design: "空间布局与建设设计",
  action_plan: "行动计划与项目清单",
};

export function isWriterType(value: unknown): value is WriterType {
  return typeof value === "string" && WRITER_TYPES.includes(value as WriterType);
}

const TITLE_HINTS: Array<{ writerType: WriterType; keywords: string[] }> = [
  { writerType: "action_plan", keywords: ["行动", "实施", "分期", "项目清单", "投资", "保障措施"] },
  { writerType: "spatial_design", keywords: ["空间", "布局", "用地", "片区", "节点", "道路", "设施", "设计"] },
  { writerType: "strategy_solution", keywords: ["策略", "定位", "目标", "发展方向", "建设方案"] },
  { writerType: "fact_analysis", keywords: ["概况", "现状", "基础", "分析", "调研", "评价", "背景", "编制依据"] },
];

export function suggestWriterTypeFromTitle(title: string): WriterType | null {
  const normalized = title.trim().toLowerCase();
  const matches = TITLE_HINTS
    .map((item) => ({
      writerType: item.writerType,
      score: item.keywords.filter((keyword) => normalized.includes(keyword.toLowerCase())).length,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!matches.length || (matches[1] && matches[0].score === matches[1].score)) return null;
  return matches[0].writerType;
}
