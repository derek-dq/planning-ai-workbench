"use client";

import Link from "next/link";
import { useState } from "react";

import { DELIVERABLE_STATUS_LABELS } from "@/domain/deliverable-labels";
import type { DeliverablesSummary } from "@/server/deliverables/summary";

export function DeliverablesOverview({ summary }: { summary: DeliverablesSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function exportWord() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${summary.projectId}/deliverables/export`, { method: "POST" });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const code = typeof data === "object" && data !== null && "error" in data ? data.error : null;
        throw new Error(code === "NO_CONFIRMED_CONTENT"
          ? "没有已确认内容，不能导出。"
          : "当前环境暂不支持导出。");
      }
      throw new Error("当前环境暂不支持导出。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "当前环境暂不支持导出。");
    } finally {
      setPending(false);
    }
  }

  const issueSections = summary.sections.filter((item) => item.unresolvedIssues.length);
  return <div className="deliverables-page">
    <header className="deliverables-header">
      <div><p className="eyebrow">项目成果</p><h1>成果与版本</h1><p>汇总当前确认目录的编制、校核和确认状态；未确认内容不会进入成果。</p></div>
      <div className="deliverables-export">
        <button className="button" type="button" disabled={pending || summary.exportableSections.length === 0} onClick={exportWord}>
          {pending ? "正在准备…" : "导出 Word"}
        </button>
        <small>{summary.exportableSections.length === 0 ? "没有已确认内容，暂不能导出。" : "当前环境暂不支持导出。"}</small>
      </div>
    </header>
    {error && <div className="review-notice error" aria-live="polite">{error}</div>}
    <section className="deliverables-metrics">
      <div><span>目录子节</span><strong>{summary.sections.length}</strong></div>
      <div><span>已确认</span><strong>{summary.exportableSections.length}</strong></div>
      <div><span>未处理问题</span><strong>{summary.unresolvedIssueCount}</strong></div>
      <div><span>待专业确认</span><strong>{summary.professionalConfirmationCount}</strong></div>
    </section>
    <div className="deliverables-grid">
      <main className="deliverables-sections">
        <div className="section-heading"><div><p className="eyebrow">章节状态</p><h2>当前项目编制进度</h2></div></div>
        {summary.sections.map((item) => <article className="deliverable-row" key={item.sectionId}>
          <div><small>{item.chapterTitle}</small><strong>{item.sectionTitle}</strong><p>{item.detail}</p></div>
          <span className={`deliverable-status ${item.status}`}>{DELIVERABLE_STATUS_LABELS[item.status]}</span>
          <Link className="button secondary" href={`/projects/${summary.projectId}/workbench/chapters/${item.chapterId}/sections/${item.sectionId}`}>查看</Link>
        </article>)}
      </main>
      <aside className="deliverables-issues">
        <p className="eyebrow">未处理事项</p>
        <h2>校核与专业确认</h2>
        {issueSections.length ? issueSections.map((section) => <section key={section.sectionId}>
          <strong>{section.sectionTitle}</strong>
          {section.unresolvedIssues.map((issue) => <Link key={issue.issueId} href={`/projects/${summary.projectId}/workbench/reviews/${section.chapterId}/sections/${section.sectionId}`}>
            <span>{issue.type === "must_fix" ? "必须处理" : "待专业确认"}</span>
            <p>{issue.problem}</p>
          </Link>)}
        </section>) : <div className="review-empty"><strong>暂无未处理事项</strong><p>新的校核问题会在这里汇总。</p></div>}
        <div className="export-scope-note"><strong>Word 导出范围</strong><p>仅包含当前有效确认的子节正文、标题和资料依据。未确认草稿不会混入。</p></div>
      </aside>
    </div>
  </div>;
}
