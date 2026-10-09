"use client";

import { useState } from "react";
import Link from "next/link";

import type { PlannerOutlineDocument } from "@/domain/projects/schema";
import {
  WRITER_TYPES,
  WRITER_TYPE_LABELS,
  isWriterType,
  suggestWriterTypeFromTitle,
} from "@/domain/writer/writer-types";
import type {
  PlannerOutlineChapter,
  PlannerOutlineNode,
  PlannerOutlineNodeBase,
  PlannerOutput,
  PlannerSuggestion,
} from "@/server/planner/contracts";

const errorMessages: Record<string, string> = {
  PLANNER_NOT_CONFIGURED: "方案结构生成服务尚未配置。",
  PLANNER_INPUT_INSUFFICIENT: "项目背景或成果要求尚未满足生成条件，请先检查项目资料。",
  PLANNER_TIMEOUT: "生成请求超时，现有建议保持不变，可稍后重试。",
  PLANNER_RATE_LIMITED: "生成服务当前繁忙，现有建议保持不变，请稍后重试。",
  PLANNER_PROVIDER_FAILED: "生成服务暂时不可用，现有建议保持不变，可稍后重试。",
  PLANNER_EMPTY_RESPONSE: "生成服务未返回有效内容，现有建议保持不变，可重新生成。",
  PLANNER_OUTPUT_INVALID: "生成结果未通过内容校验，未保存任何建议，可重新生成。",
  PLANNER_SAVE_FAILED: "生成结果已校验但保存失败，现有建议保持不变，可重试。",
  OUTLINE_NOT_FOUND: "当前没有可操作的工作结构，请先应用一份 AI 建议。",
  OUTLINE_VALIDATION_FAILED: "工作结构未通过校验。请检查章节名称、子节名称与前置内容后再保存。",
  OUTLINE_CONFIRM_CONFLICT: "工作结构已在其他操作中更新，请刷新页面后再试。",
  OUTLINE_WRITE_FAILED: "方案结构保存失败，浏览器中的编辑内容已保留，可重试。",
};

type ApiError = { code?: string };

export function PlannerOutline({ projectId, initialOutline }: { projectId: string; initialOutline: PlannerOutlineDocument }) {
  const [outline, setOutline] = useState(initialOutline);
  const [draft, setDraft] = useState<PlannerOutput | null>(initialOutline.workingOutline?.content ?? null);
  const [isDirty, setIsDirty] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const suggestion = outline.latestSuggestion;
  const working = outline.workingOutline;

  async function request<T>(url: string, init: RequestInit): Promise<T | null> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ApiError;
      setError(errorMessages[payload.code ?? ""] ?? "操作失败，请稍后重试。");
      return null;
    }
    return response.json() as Promise<T>;
  }

  async function generate(): Promise<void> {
    setIsGenerating(true); setError(null);
    try {
      const next = await request<PlannerSuggestion>(`/api/projects/${projectId}/outline/generate`, { method: "POST" });
      if (next) setOutline((current) => ({ ...current, latestSuggestion: next }));
    } catch { setError("无法连接本地生成服务，请检查应用状态后重试。"); }
    finally { setIsGenerating(false); }
  }

  async function applySuggestion(): Promise<void> {
    if (!suggestion) return;
    if (working && !window.confirm("应用最新 AI 建议会替换当前未确认的工作结构；已确认版本不会受影响。是否继续？")) return;
    setError(null);
    try {
      const next = await request<PlannerOutlineDocument>(`/api/projects/${projectId}/outline/apply-suggestion`, { method: "POST" });
      if (next) { setOutline(next); setDraft(next.workingOutline?.content ?? null); setIsDirty(false); }
    } catch { setError("无法连接本地保存服务，请稍后重试。"); }
  }

  async function save(): Promise<void> {
    if (!working || !draft) return;
    setIsSaving(true); setError(null);
    try {
      const next = await request<PlannerOutlineDocument>(`/api/projects/${projectId}/outline/working`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: working.revision, content: draft }),
      });
      if (next) { setOutline(next); setDraft(next.workingOutline?.content ?? null); setIsDirty(false); }
    } catch { setError("无法连接本地保存服务，当前编辑内容已保留，可重试。"); }
    finally { setIsSaving(false); }
  }

  async function confirm(): Promise<void> {
    if (!working || isDirty) return;
    setIsConfirming(true); setError(null);
    try {
      const next = await request<PlannerOutlineDocument>(`/api/projects/${projectId}/outline/confirm`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: working.revision }),
      });
      if (next) setOutline(next);
    } catch { setError("无法连接本地确认服务，请稍后重试。"); }
    finally { setIsConfirming(false); }
  }

  function updateDraft(next: PlannerOutput): void { setDraft(next); setIsDirty(true); }

  return <div className="outline-page">
    <header className="page-header outline-heading">
      <div><p className="eyebrow">动态方案结构</p><h1>方案结构</h1><p>AI 建议与人工工作结构分别保存；重新生成只更新 AI 建议，不会覆盖工作结构或已确认版本。</p></div>
      <div className="outline-top-actions"><span className="status-chip muted">当前确认版本：{outline.activeConfirmedVersion ?? "未确认"}</span><button className="button secondary" type="button" disabled={!working} onClick={() => setEditing((value) => !value)}>{editing ? "返回结构总览" : "编辑结构"}</button><button className="button" type="button" disabled={isGenerating} onClick={() => void generate()}>{isGenerating ? "正在生成建议结构…" : suggestion ? "重新生成建议结构" : "生成建议结构"}</button></div>
    </header>
    {error && <section className="state-card error" role="alert"><h2>操作未完成</h2><p>{error}</p></section>}
    {!suggestion && !isGenerating && !error && <section className="state-card"><h2>尚无建议结构</h2><p>请确认项目背景和成果要求已在“项目资料”中采用，然后生成项目专属的方案结构。</p></section>}
    {suggestion && <section className="outline-suggestion-strip"><div><p className="eyebrow">AI 建议结构</p><strong>{suggestion.content.outlineTitle}</strong><span>生成于 {new Date(suggestion.generatedAt).toLocaleString("zh-CN", { hour12: false })} · {suggestion.latencyMs}ms</span></div><button className="button secondary" type="button" onClick={() => void applySuggestion()}>应用为工作结构</button></section>}
    {working && draft && (editing ? <section className="outline-library info-card working-outline-card"><div className="section-heading working-outline-header"><div><p className="eyebrow">编辑工作结构 · 修订 {working.revision}</p><h2>{draft.outlineTitle}</h2><p className="working-outline-hint">{isDirty ? "存在未保存的人工调整。保存后才能确认。" : "当前工作结构已保存。"}</p><span className={`working-outline-status ${isDirty ? "dirty" : "saved"}`}>{isDirty ? "有未保存修改" : "已保存"}</span></div><div className="action-row outline-primary-actions"><button className="button secondary" type="button" disabled={!isDirty || isSaving} onClick={() => void save()}>{isSaving ? "正在保存…" : "保存工作结构"}</button><button className="button" type="button" disabled={isDirty || isConfirming} onClick={() => void confirm()}>{isConfirming ? "正在确认…" : "确认方案结构"}</button></div></div><WorkingOutlineEditor content={draft} onChange={updateDraft} /></section> : <OutlineOverview projectId={projectId} content={draft} />)}
    {suggestion && <SuggestionDetails suggestion={suggestion} />}
  </div>;
}

function OutlineOverview({ projectId, content }: { projectId: string; content: PlannerOutput }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <section className="outline-overview"><div className="overview-chapter-list">{content.chapters.map((chapter, chapterIndex) => {
    const opened = expanded === chapter.nodeId;
    const dependency = chapter.prerequisiteNodeIds.length ? `依赖 ${chapter.prerequisiteNodeIds.length} 项前置内容` : "无前置依赖";
    const materialGap = chapter.requiredMaterials.length ? `需核对 ${chapter.requiredMaterials.length} 项资料` : "资料要求待补充";
    return <article className={`overview-chapter-card ${opened ? "expanded" : ""}`} key={chapter.nodeId}>
      <button className="overview-chapter-toggle" type="button" onClick={() => setExpanded(opened ? null : chapter.nodeId)} aria-expanded={opened}>
        <span className="chapter-number">第 {chapterIndex + 1} 章</span>
        <span className="chapter-summary"><strong>{chapter.title}</strong><small>{chapter.sections.length} 个子节 · {dependency} · {materialGap}</small></span>
        <span className="status-chip">可开始</span>
        <span className="toggle-symbol">{opened ? "−" : "+"}</span>
      </button>
      {opened && <div className="overview-sections">{chapter.sections.map((section, sectionIndex) => <div className="overview-section-row" key={section.nodeId}>
        <div>
          <span className="section-number">{chapterIndex + 1}.{sectionIndex + 1}</span>
          <strong>{section.title}</strong>
          <p>{section.prerequisiteNodeIds.length ? "等待前置内容" : "可开始"} · {section.requiredMaterials.length ? `资料待核对 ${section.requiredMaterials.length} 项` : "资料状态待补充"} · 写作类型：{section.writerType ? WRITER_TYPE_LABELS[section.writerType] : "待确认写作类型"}</p>
        </div>
        <Link className="button secondary" href={`/projects/${projectId}/workbench/chapters/${chapter.nodeId}/sections/${section.nodeId}`}>进入编制</Link>
      </div>)}</div>}
    </article>;
  })}</div></section>;
}

function WorkingOutlineEditor({ content, onChange }: { content: PlannerOutput; onChange: (content: PlannerOutput) => void }) {
  function updateChapter(index: number, update: (chapter: PlannerOutlineChapter) => PlannerOutlineChapter) {
    const chapters = content.chapters.map((chapter, current) => current === index ? update(chapter) : chapter);
    onChange({ ...content, chapters });
  }
  function moveChapter(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= content.chapters.length) return;
    const chapters = [...content.chapters]; [chapters[index], chapters[target]] = [chapters[target], chapters[index]]; onChange({ ...content, chapters });
  }
  function addChapter() { onChange({ ...content, chapters: [...content.chapters, createEmptyChapter()] }); }
  function deleteChapter(index: number) {
    if (content.chapters.length <= 1 || !window.confirm("删除该章节及其全部子节？此操作会在保存工作结构后生效。")) return;
    onChange({ ...content, chapters: content.chapters.filter((_, current) => current !== index) });
  }
  function addSection(chapterIndex: number) { updateChapter(chapterIndex, (chapter) => ({ ...chapter, sections: [...chapter.sections, createEmptySection()] })); }
  function deleteSection(chapterIndex: number, sectionIndex: number) {
    const chapter = content.chapters[chapterIndex];
    if (chapter.sections.length <= 1 || !window.confirm("删除该子节？此操作会在保存工作结构后生效。")) return;
    updateChapter(chapterIndex, (current) => ({ ...current, sections: current.sections.filter((_, index) => index !== sectionIndex) }));
  }
  return <div className="outline-tree editor-outline-tree"><div className="editor-outline-toolbar"><p>可调整章节与子节；结构至少保留一个章节和一个子节。</p><button className="button secondary" type="button" onClick={addChapter}>新增章节</button></div>{content.chapters.map((chapter, chapterIndex) => <article className="outline-chapter editor-chapter" key={chapter.nodeId}>
    <div className="editor-card-header"><div><p className="node-index">第 {chapterIndex + 1} 章</p><h3>章节编制信息</h3></div><div className="outline-move-actions"><button className="outline-move-button" type="button" disabled={chapterIndex === 0} onClick={() => moveChapter(chapterIndex, -1)}>上移</button><button className="outline-move-button" type="button" disabled={chapterIndex === content.chapters.length - 1} onClick={() => moveChapter(chapterIndex, 1)}>下移</button><button className="outline-move-button danger" type="button" disabled={content.chapters.length <= 1} onClick={() => deleteChapter(chapterIndex)}>删除章节</button></div></div>
    <div className="outline-fields"><label className="outline-field"><span>章节名称</span><input value={chapter.title} onChange={(event) => updateChapter(chapterIndex, (item) => ({ ...item, title: event.target.value }))} /></label>
    <label className="outline-field"><span>编制重点 <small>每行一项</small></span><textarea value={chapter.keyPoints.join("\n")} onChange={(event) => updateChapter(chapterIndex, (item) => ({ ...item, keyPoints: lines(event.target.value) }))} /></label></div>
    <div className="outline-sections"><div className="outline-sections-heading"><strong>子节</strong><button className="text-button" type="button" onClick={() => addSection(chapterIndex)}>新增子节</button></div>{chapter.sections.map((section, sectionIndex) => <EditableSection key={section.nodeId} chapter={chapter} chapterIndex={chapterIndex} sectionIndex={sectionIndex} sectionCount={chapter.sections.length} onDelete={() => deleteSection(chapterIndex, sectionIndex)} onUpdate={updateChapter} />)}</div>
  </article>)}</div>;
}

function EditableSection({ chapter, chapterIndex, sectionIndex, sectionCount, onDelete, onUpdate }: { chapter: PlannerOutlineChapter; chapterIndex: number; sectionIndex: number; sectionCount: number; onDelete: () => void; onUpdate: (index: number, update: (chapter: PlannerOutlineChapter) => PlannerOutlineChapter) => void }) {
  const section = chapter.sections[sectionIndex];
  const titleSuggestion = section.writerType === null ? suggestWriterTypeFromTitle(section.title) : null;
  function update(update: (current: typeof section) => typeof section) { onUpdate(chapterIndex, (current) => ({ ...current, sections: current.sections.map((item, index) => index === sectionIndex ? update(item) : item) })); }
  function move(direction: -1 | 1) { const target = sectionIndex + direction; if (target < 0 || target >= chapter.sections.length) return; onUpdate(chapterIndex, (current) => { const sections = [...current.sections]; [sections[sectionIndex], sections[target]] = [sections[target], sections[sectionIndex]]; return { ...current, sections }; }); }
  return <article className="outline-section editor-section">
    <div className="editor-card-header editor-section-header"><p className="node-index">{chapterIndex + 1}.{sectionIndex + 1}</p><div className="outline-move-actions"><button className="outline-move-button" type="button" disabled={sectionIndex === 0} onClick={() => move(-1)}>上移</button><button className="outline-move-button" type="button" disabled={sectionIndex === chapter.sections.length - 1} onClick={() => move(1)}>下移</button><button className="outline-move-button danger" type="button" disabled={sectionCount <= 1} onClick={onDelete}>删除子节</button></div></div>
    <div className="outline-fields">
      <label className="outline-field"><span>子节名称</span><input value={section.title} onChange={(event) => update((item) => ({ ...item, title: event.target.value }))} /></label>
      <label className="outline-field">
        <span>写作类型</span>
        <select value={section.writerType ?? ""} onChange={(event) => update((item) => ({ ...item, writerType: isWriterType(event.target.value) ? event.target.value : null }))}>
          <option value="">待确认写作类型</option>
          {WRITER_TYPES.map((writerType) => <option key={writerType} value={writerType}>{WRITER_TYPE_LABELS[writerType]}</option>)}
        </select>
      </label>
      {titleSuggestion && <p className="writer-type-suggestion">标题辅助建议：{WRITER_TYPE_LABELS[titleSuggestion]}。系统不会自动采用。 <button className="text-button" type="button" onClick={() => update((item) => ({ ...item, writerType: titleSuggestion }))}>采用建议</button></p>}
      <label className="outline-field"><span>编制重点 <small>每行一项</small></span><textarea value={section.keyPoints.join("\n")} onChange={(event) => update((item) => ({ ...item, keyPoints: lines(event.target.value) }))} /></label>
    </div>
  </article>;
}

function lines(value: string): string[] { return value.split("\n").map((item) => item.trim()).filter(Boolean); }

function createEmptyChapter(): PlannerOutlineChapter {
  return { ...createOutlineNode("章节名称", "说明本章节的编制内容"), nodeId: newNodeId("chapter"), sections: [createEmptySection()] };
}

function createEmptySection(): PlannerOutlineNode {
  return { ...createOutlineNode("子节名称", "说明本子节的编制内容"), nodeId: newNodeId("section"), writerType: null };
}

function createOutlineNode(title: string, purpose: string): PlannerOutlineNodeBase {
  return { nodeId: "placeholder", title, purpose, keyPoints: [], requiredMaterials: [], prerequisiteNodeIds: [], prerequisiteNotes: [], estimatedLengthChars: 1000, generationBasis: [] };
}

function newNodeId(prefix: "chapter" | "section"): string {
  const suffix = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${suffix}`.slice(0, 80);
}

function SuggestionDetails({ suggestion }: { suggestion: PlannerSuggestion }) {
  return <details className="suggestion-details"><summary>查看 AI 建议的生成依据与资料引用</summary><div>{suggestion.content.chapters.map((chapter, index) => <article className="outline-chapter" key={chapter.nodeId}><p className="node-index">第 {index + 1} 章</p><h3>{chapter.title}</h3><p>编制重点：{chapter.keyPoints.join("；")}</p><p>生成依据：{chapter.generationBasis.map((item) => `${item.materialId}：${item.reason}`).join("；") || "暂无"}</p></article>)}</div></details>;
}
