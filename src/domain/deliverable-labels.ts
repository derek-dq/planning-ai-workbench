import type { DeliverableSectionStatus } from "@/server/deliverables/summary";

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableSectionStatus, string> = {
  not_started: "未开始",
  waiting: "等待前置内容",
  in_progress: "编制中",
  must_fix: "必须处理",
  professional_confirmation: "待专业确认",
  confirmed: "已确认",
};
