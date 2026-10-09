"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SectionDraftDocument } from "@/domain/projects/schema";
import { REVIEW_DIMENSION_LABELS, REVIEW_ISSUE_TYPE_LABELS } from "@/domain/review-labels";
import type {
  ReviewDimension,
  ReviewIssueType,
  ReviewRun,
  SectionReviewDocument,
} from "@/server/reviewer/contracts";
import type { PlannerOutlineNode } from "@/server/planner/contracts";
import type { SectionDependencyState } from "@/server/dependencies/section-dependency";

type Props = {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  task: PlannerOutlineNode;
  draft: SectionDraftDocument | null;
  review: SectionReviewDocument | null;
  latestRun: ReviewRun | null;
  isLatestReviewCurrent: boolean;
  dependency: SectionDependencyState;
};

const errorMessages: Record<string, string> = {
  REVIEWER_DRAFT_NOT_FOUND: "尚无已保存草稿，请先返回章节编制保存正文。",
  REVIEWER_DRAFT_EMPTY: "正文为空，不能提交内容校核。",
  REVIEWER_INPUT_INSUFFICIENT: "当前资料不足，无法形成可靠校核结论。",
  REVIEWER_NOT_CONFIGURED: "内容校核模型尚未配置，请检查服务端环境变量。",
  REVIEWER_TIMEOUT: "模型调用超时，请重试。",
  REVIEWER_RATE_LIMITED: "模型服务限流，请稍后重试。",
  REVIEWER_EMPTY_RESPONSE: "模型未返回校核结果，请重试。",
  REVIEWER_OUTPUT_INVALID: "校核结果未通过结构或业务校验，未保存报告。",
  REVIEWER_PROVIDER_FAILED: "模型服务异常，请重试。",
  REVIEWER_SAVE_FAILED: "校核报告保存失败，原草稿和历史报告未受影响。",
  SECTION_REVIEW_STALE: "草稿已变化，当前校核或修改建议已失效，请重新校核。",
  SECTION_REVIEW_BLOCKED: "仍有必须处理或待专业确认事项，不能确认当前子节。",
  SECTION_REVIEW_VALIDATION_FAILED: "处理信息不完整，请填写明确说明后重试。",
  REVIEW_ISSUE_ATTEMPTS_EXHAUSTED: "该问题已达到两次 AI 修改上限，请转人工处理。",
  REVIEW_REVISION_NOT_FOUND: "尚无可应用的 AI 修改建议。",
  SECTION_DRAFT_CONFLICT: "草稿已变化，未应用陈旧修改建议。",
  SECTION_REVIEW_WRITE_FAILED: "保存失败，原有校核、草稿和版本未受影响。",
  WRITER_OUTPUT_INVALID: "AI 修改建议未通过内容校验，未保存候选。",
  WRITER_PROVIDER_FAILED: "AI 修改服务异常，请重试。",
  WRITER_TIMEOUT: "AI 修改调用超时，请重试。",
  REVIEWER_DEPENDENCY_UNMET: "等待前置内容，或前置确认已变化；请先完成前置确认并更新当前草稿。",
  SECTION_DEPENDENCY_UNMET: "等待前置内容，或前置确认已变化；请先完成前置确认并更新当前草稿。",
};

export function SectionReviewWorkbench({
  projectId,
  chapterId,
  chapterTitle,
  sectionId,
  task,
  draft,
  review,
  latestRun,
  isLatestReviewCurrent,
  dependency,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<ReviewIssueType | "all">("all");
  const [dimensionFilter, setDimensionFilter] = useState<ReviewDimension | "all">("all");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = `/api/projects/${projectId}/reviews/${chapterId}/sections/${sectionId}`;

  const issues = useMemo(() => (latestRun?.issues ?? []).filter((issue) =>
    (typeFilter === "all" || issue.type === typeFilter)
    && (dimensionFilter === "all" || issue.dimension === dimensionFilter)), [latestRun, typeFilter, dimensionFilter]);

  const blocking = useMemo(() => {
    if (!latestRun || !review || !isLatestReviewCurrent) return true;
    return latestRun.issues.some((issue) => {
      const state = review.issueStates[issue.issueId];
      if (issue.type === "must_fix") return state?.status === "open" || state?.status === "manual_required" || !state;
      return issue.type === "professional_confirmation" && (state?.status === "open" || !state);
    });
  }, [latestRun, review, isLatestReviewCurrent]);
  const dependencyConfirmationBlocked = dependency.status !== "none" && dependency.status !== "ready";
  const reviewSubmissionBlocked = dependency.mode === "blocking" && dependency.status === "waiting";

  async function request(path: string, method: "POST" | "PATCH" | "PUT", body?: object) {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error : "SECTION_REVIEW_WRITE_FAILED";
      throw new Error(code);
    }
    return data;
  }

  function showError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : "SECTION_REVIEW_WRITE_FAILED";
    setError(errorMessages[code] ?? "操作失败，请重试。");
  }

  async function submitReview() {
    setPending("review");
    setError(null);
    setMessage("正在校核当前已保存草稿…");
    try {
      await request("/generate", "POST");
      setMessage("内容校核已完成。");
      window.location.reload();
    } catch (cause) {
      showError(cause);
      setMessage(null);
    } finally {
      setPending(null);
    }
  }

  async function handleIssue(issueId: string, type: ReviewIssueType, decision: "accepted" | "resolved") {
    const note = type === "professional_confirmation"
      ? window.prompt(decision === "accepted" ? "请记录专业确认依据或接受说明：" : "请记录拒绝或处理说明：", "")
      : decision === "accepted" ? "已接受该优化建议。" : "本轮暂不处理该建议。";
    if (note === null) return;
    setPending(`issue:${issueId}`);
    setError(null);
    try {
      await request(`/issues/${issueId}`, "PATCH", { decision, note });
      setMessage("问题处理状态已保存。");
      window.location.reload();
    } catch (cause) {
      showError(cause);
    } finally {
      setPending(null);
    }
  }

  async function generateRevision(issueId: string) {
    setPending(`revision:${issueId}`);
    setError(null);
    setMessage("正在针对该问题生成修改建议…");
    try {
      await request(`/issues/${issueId}/revision`, "POST");
      setMessage("AI 修改建议已生成，尚未应用到人工草稿。");
      window.location.reload();
    } catch (cause) {
      showError(cause);
      setMessage(null);
    } finally {
      setPending(null);
    }
  }

  async function applyRevision(issueId: string) {
    if (!draft?.workingDraft) return;
    if (!window.confirm("应用后将更新当前人工草稿并使本次校核失效。是否继续？")) return;
    setPending(`apply:${issueId}`);
    setError(null);
    try {
      await request(`/issues/${issueId}/revision`, "PUT", { expectedRevision: draft.workingDraft.revision });
      setMessage("修改建议已应用到草稿，请返回章节编制核对并重新校核。");
      window.location.reload();
    } catch (cause) {
      showError(cause);
    } finally {
      setPending(null);
    }
  }

  async function confirmSection() {
    setPending("confirm");
    setError(null);
    try {
      await request("/confirm", "POST");
      setMessage("当前子节已确认并创建不可变版本快照。");
      window.location.reload();
    } catch (cause) {
      showError(cause);
    } finally {
      setPending(null);
    }
  }

  return <div className="review-workbench">
    <header className="review-page-header">
      <div>
        <Link className="text-button" href={`/projects/${projectId}/workbench/chapters/${chapterId}/sections/${sectionId}`}>← 返回章节编制</Link>
        <p className="eyebrow">内容校核</p>
        <h1>{task.title}</h1>
        <p>{chapterTitle} · 草稿版本 {draft?.workingDraft?.revision ?? "—"}</p>
      </div>
      <div className="review-header-actions">
        <span className={`review-validity ${isLatestReviewCurrent ? "current" : "stale"}`}>
          {latestRun ? isLatestReviewCurrent ? "基于最新草稿" : "校核已失效" : "尚未校核"}
        </span>
        <button className="button" type="button" disabled={reviewSubmissionBlocked || !draft?.workingDraft?.contentMarkdown.trim() || pending !== null} onClick={submitReview}>
          {pending === "review" ? "校核中…" : latestRun ? "重新校核" : "提交内容校核"}
        </button>
      </div>
    </header>

    {(message || error) && <div className={`review-notice ${error ? "error" : "success"}`} aria-live="polite">{error ?? message}</div>}

    <section className="review-gate">
      <div><span>草稿状态</span><strong>{draft?.workingDraft ? "已保存" : "无可校核草稿"}</strong></div>
      <div><span>校核依据</span><strong>{isLatestReviewCurrent ? "最新草稿" : "需重新校核"}</strong></div>
      <div><span>必须处理</span><strong>{latestRun?.issues.filter((item) => item.type === "must_fix").length ?? 0}</strong></div>
      <div><span>待专业确认</span><strong>{latestRun?.issues.filter((item) => item.type === "professional_confirmation").length ?? 0}</strong></div>
      <div><span>跨章节依据</span><strong>{dependency.predecessor ? dependency.status === "ready" ? "已确认" : dependency.status === "provisional" ? "暂定依据" : dependency.status === "stale" ? "需重新校核" : "等待前置内容" : "无"}</strong></div>
      <button className="button" type="button" disabled={blocking || dependencyConfirmationBlocked || pending !== null} onClick={confirmSection}>
        {pending === "confirm" ? "确认中…" : "确认当前子节"}
      </button>
      {(blocking || dependencyConfirmationBlocked) && <p>确认条件：最新校核有效、无必须处理、待专业确认均已明确处理；参考依赖需在前置内容确认后重新校核。</p>}
    </section>

    <div className="review-grid">
      <aside className="review-draft-panel">
        <p className="eyebrow">当前已保存正文</p>
        <h2>{task.title}</h2>
        <p className="review-task">{task.purpose}</p>
        <div className="review-draft-preview">{draft?.workingDraft?.contentMarkdown || "尚无已保存正文。"}</div>
        <Link className="button secondary" href={`/projects/${projectId}/workbench/chapters/${chapterId}/sections/${sectionId}`}>返回人工编辑</Link>
      </aside>

      <main className="review-issues-panel">
        <div className="review-panel-heading">
          <div><p className="eyebrow">问题处理</p><h2>{latestRun ? REVIEW_ISSUE_TYPE_LABELS.must_fix + "与校核建议" : "等待提交校核"}</h2></div>
          {latestRun && <div className="review-filters">
            <select aria-label="按问题类型筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ReviewIssueType | "all")}>
              <option value="all">全部问题</option>
              {Object.entries(REVIEW_ISSUE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="按维度筛选" value={dimensionFilter} onChange={(event) => setDimensionFilter(event.target.value as ReviewDimension | "all")}>
              <option value="all">全部维度</option>
              {Object.entries(REVIEW_DIMENSION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>}
        </div>

        {!latestRun && <div className="review-empty"><strong>尚无校核报告</strong><p>提交后，系统将按五个业务维度列出必须处理、建议优化和待专业确认事项。</p></div>}
        {latestRun && issues.length === 0 && <div className="review-empty"><strong>当前筛选下没有问题</strong><p>可调整筛选条件查看其他校核项。</p></div>}
        <div className="review-issue-list">
          {issues.map((issue) => {
            const state = review?.issueStates[issue.issueId];
            const revision = review?.revisionSuggestions[issue.issueId];
            return <article className={`review-issue ${issue.type}`} key={issue.issueId}>
              <header>
                <div>
                  <span className={`issue-type ${issue.type}`}>{state?.status === "manual_required" ? "待人工处理" : REVIEW_ISSUE_TYPE_LABELS[issue.type]}</span>
                  <span className="issue-dimension">{REVIEW_DIMENSION_LABELS[issue.dimension]}</span>
                  {(issue.evidence.includes("前置确认") || issue.problem.includes("前置")) && <span className="cross-section-badge">跨章节冲突</span>}
                </div>
                <small>{state?.status === "accepted" ? "已接受" : state?.status === "resolved" ? "已处理" : `AI 修改 ${state?.autoRevisionAttemptCount ?? 0}/2`}</small>
              </header>
              <h3>{issue.problem}</h3>
              <dl>
                <dt>位置</dt><dd>{issue.location}</dd>
                <dt>依据</dt><dd>{issue.evidence}</dd>
                <dt>影响</dt><dd>{issue.impact}</dd>
                <dt>处理建议</dt><dd>{issue.suggestion}</dd>
              </dl>
              {revision && <div className="review-revision-preview"><strong>AI 修改建议（尚未应用）</strong><p>{revision.suggestion.content.contentMarkdown}</p></div>}
              <footer>
                <Link className="button secondary" href={`/projects/${projectId}/workbench/chapters/${chapterId}/sections/${sectionId}`}>人工编辑</Link>
                {issue.type !== "suggestion" && state?.status !== "manual_required" && <button className="button secondary" type="button" disabled={!isLatestReviewCurrent || (state?.autoRevisionAttemptCount ?? 0) >= 2 || pending !== null} onClick={() => generateRevision(issue.issueId)}>
                  {pending === `revision:${issue.issueId}` ? "生成中…" : "生成 AI 修改建议"}
                </button>}
                {revision && <button className="button" type="button" disabled={!isLatestReviewCurrent || pending !== null} onClick={() => applyRevision(issue.issueId)}>
                  {pending === `apply:${issue.issueId}` ? "应用中…" : "应用到草稿"}
                </button>}
                {issue.type === "suggestion" && state?.status === "open" && <button className="text-button" type="button" disabled={pending !== null} onClick={() => handleIssue(issue.issueId, issue.type, "accepted")}>接受建议</button>}
                {issue.type === "professional_confirmation" && state?.status === "open" && <>
                  <button className="text-button" type="button" disabled={pending !== null} onClick={() => handleIssue(issue.issueId, issue.type, "accepted")}>确认接受</button>
                  <button className="text-button" type="button" disabled={pending !== null} onClick={() => handleIssue(issue.issueId, issue.type, "resolved")}>确认不采用</button>
                </>}
              </footer>
            </article>;
          })}
        </div>
      </main>

      <aside className="review-summary-panel">
        <p className="eyebrow">五维校核</p>
        {latestRun ? <>
          <h2>{latestRun.reviewResult === "pass" ? "本轮可通过" : "本轮需修改"}</h2>
          <p>{latestRun.reviewSummary}</p>
          <div className="dimension-list">{latestRun.dimensionResults.map((item) => <div key={item.dimension}><span className={`dimension-dot ${item.status}`} /><strong>{REVIEW_DIMENSION_LABELS[item.dimension]}</strong><small>{item.summary}</small></div>)}</div>
          <details className="review-metadata"><summary>本次校核信息</summary><dl>
            <dt>模型</dt><dd>{latestRun.callMetadata.resolvedModel}</dd>
            <dt>耗时</dt><dd>{latestRun.callMetadata.latencyMs}ms</dd>
            <dt>尝试</dt><dd>{latestRun.callMetadata.attemptCount} 次</dd>
            <dt>Token</dt><dd>{latestRun.callMetadata.tokenUsage.totalTokens ?? "—"}</dd>
          </dl></details>
        </> : <div className="review-empty"><strong>五维结果待生成</strong><p>报告只基于当前已保存草稿，不会改写正文。</p></div>}
        {review?.confirmations.length ? <div className="review-confirmations"><strong>确认记录</strong>{review.confirmations.map((item) => <p key={item.confirmationId}>确认版本 {item.version} · 草稿 {item.draftRevision}</p>)}</div> : null}
      </aside>
    </div>
  </div>;
}
