"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import styles from "./demo.module.css";

export type DemoView =
  | "dashboard"
  | "projects"
  | "overview"
  | "materials"
  | "outline"
  | "chapters"
  | "review"
  | "deliverables"
  | "settings";

type IconName =
  | "home" | "spark" | "folder" | "settings" | "file" | "layers"
  | "edit" | "check" | "export" | "plus" | "search" | "arrow"
  | "chevron" | "book" | "clock" | "close" | "menu" | "send";

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  folder: <path d="M3 6h6l2 2h10v11H3V6Z"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  file: <><path d="M5 3h9l5 5v13H5V3Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  edit: <><path d="m14 5 5 5L9 20H4v-5L14 5Z"/><path d="m12 7 5 5"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  export: <><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v7h14v-7"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4Z"/><path d="M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3V4Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  send: <><path d="m3 4 18 8-18 8 4-8-4-8Z"/><path d="M7 12h14"/></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const platformNav: Array<{ view: DemoView; label: string; icon: IconName }> = [
  { view: "dashboard", label: "工作台", icon: "home" },
  { view: "overview", label: "AI项目编制台", icon: "spark" },
  { view: "projects", label: "项目库", icon: "folder" },
  { view: "settings", label: "系统设置", icon: "settings" },
];

const projectNav: Array<{ view: DemoView; label: string }> = [
  { view: "overview", label: "项目总览" },
  { view: "materials", label: "项目资料" },
  { view: "outline", label: "方案结构" },
  { view: "chapters", label: "章节编制" },
  { view: "review", label: "内容校核" },
  { view: "deliverables", label: "成果与版本" },
];

const chapters = [
  { id: "01", title: "项目背景与任务概述", sections: ["项目背景", "规划范围与期限"], status: "已确认" },
  { id: "02", title: "现状基础分析", sections: ["区位与交通条件", "人口与社会经济"], status: "编制中" },
  { id: "03", title: "发展目标与定位", sections: ["总体定位", "发展目标与指标体系"], status: "可开始" },
  { id: "04", title: "总体空间布局", sections: ["空间结构规划", "用地布局规划"], status: "待补资料" },
  { id: "05", title: "产业发展规划", sections: ["产业发展定位与方向", "重点项目与空间布局"], status: "可开始" },
];

const materials = [
  ["项目任务书", "任务边界、成果要求与编制口径", "已采用", "最新版本"],
  ["A村规划基础资料", "现状人口、用地与公共服务设施", "已采用", "待专业确认"],
  ["项目会议纪要", "业主补充要求与阶段性共识", "已采用", "最新版本"],
  ["同类村庄规划案例", "仅用于结构和表达方式参考", "参考资料", "已解析"],
];

function NavLink({ view, label, icon, active }: { view: DemoView; label: string; icon?: IconName; active: boolean }) {
  return <Link href={`/demo/${view}`} className={`${styles.navLink} ${active ? styles.navActive : ""}`} aria-current={active ? "page" : undefined}>{icon && <Icon name={icon} />}<span>{label}</span></Link>;
}

function Button({ children, icon, secondary, danger, onClick, disabled, type = "button" }: { children: ReactNode; icon?: IconName; secondary?: boolean; danger?: boolean; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`${styles.button} ${secondary ? styles.buttonSecondary : ""} ${danger ? styles.buttonDanger : ""}`}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "red" | "purple" | "gray" }) {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{children}</span>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className={styles.pageHeader}><div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h1>{title}</h1>{description && <p className={styles.description}>{description}</p>}</div>{action && <div className={styles.headerAction}>{action}</div>}</header>;
}

export function DemoApp({ initialView }: { initialView: DemoView }) {
  const [modal, setModal] = useState<"project" | "material" | "export" | "apply" | null>(null);
  const [toast, setToast] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(initialView === "chapters");
  const [outlineEdit, setOutlineEdit] = useState(false);
  const [openChapter, setOpenChapter] = useState("02");
  const [reviewResolved, setReviewResolved] = useState(false);
  const [draftApplied, setDraftApplied] = useState(false);
  const isProject = !["dashboard", "projects", "settings"].includes(initialView);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2200); };

  return <div className={styles.demoRoot}>
    <aside className={styles.sidebar}>
      <Link href="/demo/dashboard" className={styles.brand}><span className={styles.brandMark}>规</span><span><strong>规策AI工作台</strong><small>规划技术方案智能编制</small></span></Link>
      <nav className={styles.platformNav} aria-label="平台导航">{platformNav.map(item => <NavLink key={item.view} {...item} active={initialView === item.view || (item.view === "overview" && isProject)} />)}</nav>
      <div className={styles.sidebarProject}><span className={styles.avatar}>张</span><span><strong>项目工作组</strong><small>本地演示环境</small></span></div>
    </aside>

    <section className={styles.shell}>
      {isProject && <><div className={styles.projectBar}><div><span className={styles.projectGlyph}><Icon name="file" size={15} /></span><strong>A村典型村规划设计</strong><Badge>演示项目</Badge></div><button className={styles.iconButton} aria-label="打开AI助手" onClick={() => setCopilotOpen(true)}><Icon name="spark" /></button></div><nav className={styles.projectNav} aria-label="项目导航">{projectNav.map(item => <NavLink key={item.view} view={item.view} label={item.label} active={initialView === item.view} />)}</nav></>}

      <main className={`${styles.main} ${isProject ? styles.mainProject : ""}`}>
        {initialView === "dashboard" && <Dashboard />}
        {initialView === "projects" && <Projects onNew={() => setModal("project")} />}
        {initialView === "overview" && <Overview />}
        {initialView === "materials" && <Materials onAdd={() => setModal("material")} onOpen={() => flash("已打开资料摘要")} />}
        {initialView === "outline" && <Outline editing={outlineEdit} setEditing={setOutlineEdit} openChapter={openChapter} setOpenChapter={setOpenChapter} onSave={() => flash("工作结构已保存")} onConfirm={() => flash("方案结构已确认，版本 3")} />}
        {initialView === "chapters" && <Chapters copilotOpen={copilotOpen} setCopilotOpen={setCopilotOpen} draftApplied={draftApplied} onApply={() => setModal("apply")} onSave={() => flash("草稿已保存")} onVersion={() => flash("版本快照 V3 已创建")} />}
        {initialView === "review" && <Review resolved={reviewResolved} onResolve={() => { setReviewResolved(true); flash("问题已标记为已处理"); }} />}
        {initialView === "deliverables" && <Deliverables onExport={() => setModal("export")} />}
        {initialView === "settings" && <Settings onSave={() => flash("设置已保存")} />}
      </main>
    </section>

    {modal === "project" && <Modal title="新建项目" onClose={() => setModal(null)}><label className={styles.field}>项目名称<input defaultValue="B镇产业发展规划" /></label><label className={styles.field}>项目类型<select defaultValue="village"><option value="village">村庄规划</option><option value="town">乡镇规划</option><option value="consult">专项咨询</option></select></label><div className={styles.modalActions}><Button secondary onClick={() => setModal(null)}>取消</Button><Button onClick={() => { setModal(null); flash("演示项目已创建"); }}>创建项目</Button></div></Modal>}
    {modal === "material" && <Modal title="添加项目资料" onClose={() => setModal(null)}><div className={styles.dropzone}><Icon name="export" size={24} /><strong>选择或拖入资料</strong><span>演示模式不会实际上传文件</span></div><div className={styles.modalActions}><Button secondary onClick={() => setModal(null)}>取消</Button><Button onClick={() => { setModal(null); flash("演示资料已加入清单"); }}>加入资料</Button></div></Modal>}
    {modal === "apply" && <Modal title="应用AI建议到草稿" onClose={() => setModal(null)}><p className={styles.modalText}>应用后会更新当前工作草稿，但不会修改历史版本。是否继续？</p><div className={styles.modalActions}><Button secondary onClick={() => setModal(null)}>取消</Button><Button onClick={() => { setDraftApplied(true); setModal(null); flash("AI建议已应用，尚未保存"); }}>确认应用</Button></div></Modal>}
    {modal === "export" && <Modal title="导出成果" onClose={() => setModal(null)}><label className={styles.field}>导出范围<select><option>全部已确认内容</option><option>第1章 · 项目背景与任务概述</option></select></label><div className={styles.exportNote}><Icon name="check" /><span>将导出 1 个已确认章节，共 2 个子节；未确认内容不会包含在成果中。</span></div><div className={styles.modalActions}><Button secondary onClick={() => setModal(null)}>取消</Button><Button icon="export" onClick={() => { setModal(null); flash("演示导出已完成"); }}>生成 Word</Button></div></Modal>}
    {toast && <div className={styles.toast} role="status"><Icon name="check" />{toast}</div>}
  </div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={e => e.stopPropagation()}><header><h2 id="modal-title">{title}</h2><button className={styles.iconButton} aria-label="关闭" onClick={onClose}><Icon name="close" /></button></header><div className={styles.modalBody}>{children}</div></section></div>;
}

function Dashboard() {
  return <div className={styles.content}><PageHeader eyebrow="今日工作" title="上午好，张工" description="继续推进当前项目，重要事项已按优先级整理。" action={<Link className={styles.button} href="/demo/projects"><Icon name="folder" size={16} />查看项目库</Link>} />
    <div className={styles.dashboardGrid}><section className={`${styles.card} ${styles.currentProject}`}><div className={styles.cardTop}><div><Badge tone="green">进行中</Badge><p className={styles.kicker}>当前项目</p><h2>A村典型村规划设计</h2></div><span className={styles.progressRing}>68<small>%</small></span></div><p className={styles.muted}>方案结构已确认，正在编制“人口与社会经济”。</p><div className={styles.progress}><span style={{ width: "68%" }} /></div><div className={styles.cardActions}><Link className={styles.button} href="/demo/chapters">继续编制<Icon name="arrow" size={16} /></Link><Link className={styles.textLink} href="/demo/overview">查看项目总览</Link></div></section>
      <section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.kicker}>优先事项</p><h2>今天需要处理</h2></div><Badge tone="red">3 项</Badge></div>{[["必须处理","人口数据口径与任务书不一致","red"],["待专业确认","近期人口目标需规划师判断","purple"],["待补资料","缺少最新产业经营数据","amber"]].map(([a,b,c]) => <div className={styles.taskRow} key={b}><Badge tone={c as "red" | "purple" | "amber"}>{a}</Badge><span>{b}</span><Icon name="arrow" size={15} /></div>)}</section></div>
    <div className={styles.sectionTitle}><div><p className={styles.kicker}>项目进展</p><h2>其他项目</h2></div><Link className={styles.textLink} href="/demo/projects">查看全部</Link></div><div className={styles.threeCards}>{[["B镇产业发展规划","资料整理中","36%"],["C区公共服务专项","方案结构待确认","52%"],["D村更新行动计划","内容校核中","81%"]].map(([a,b,c]) => <article className={styles.miniProject} key={a}><span className={styles.fileIcon}><Icon name="file" /></span><div><h3>{a}</h3><p>{b}</p></div><strong>{c}</strong></article>)}</div>
  </div>;
}

function Projects({ onNew }: { onNew: () => void }) {
  return <div className={styles.content}><PageHeader eyebrow="项目管理" title="项目库" description="集中查看、进入和维护规划编制项目。" action={<Button icon="plus" onClick={onNew}>新建项目</Button>} /><div className={styles.toolbar}><label className={styles.search}><Icon name="search" /><input aria-label="搜索项目" placeholder="搜索项目名称" /></label><div className={styles.filterPills}><button className={styles.pillActive}>全部 4</button><button>进行中 3</button><button>已完成 1</button></div></div><section className={styles.tableCard}><div className={styles.tableHead}><span>项目</span><span>当前阶段</span><span>负责人</span><span>更新时间</span><span /></div>{[["A村典型村规划设计","章节编制","张工","今天 10:24"],["B镇产业发展规划","项目资料","李工","昨天 17:40"],["C区公共服务专项","方案结构","王工","8月26日"],["D村更新行动计划","内容校核","赵工","8月25日"]].map((row,i) => <div className={styles.tableRow} key={row[0]}><span className={styles.projectCell}><i>{i+1}</i><span><strong>{row[0]}</strong><small>规划技术方案</small></span></span><span><Badge tone={i===3 ? "purple" : "blue"}>{row[1]}</Badge></span><span>{row[2]}</span><span className={styles.muted}>{row[3]}</span><span><Link className={styles.rowAction} href="/demo/overview">进入项目<Icon name="arrow" size={14} /></Link></span></div>)}</section></div>;
}

function Overview() {
  return <div className={styles.content}><PageHeader eyebrow="项目总览" title="A村典型村规划设计" description="当前处于章节编制阶段，整体进度正常。" action={<Link className={styles.button} href="/demo/chapters">继续编制<Icon name="arrow" size={16} /></Link>} /><div className={styles.metrics}>{[["整体进度","68%","blue"],["已确认子节","2 / 12","green"],["必须处理","1","red"],["待专业确认","2","purple"]].map(([a,b,c]) => <article className={styles.metric} key={a}><span>{a}</span><strong>{b}</strong><i className={styles[`metric_${c}`]} /></article>)}</div><div className={styles.twoColumns}><section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.kicker}>当前工作</p><h2>下一步建议</h2></div><Badge tone="blue">章节编制</Badge></div><div className={styles.nextStep}><span className={styles.stepNumber}>2.2</span><div><h3>人口与社会经济</h3><p>完成正文编制后提交内容校核，处理1项资料口径提醒。</p></div></div><Link className={styles.button} href="/demo/chapters">进入章节编制</Link></section><section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.kicker}>项目状态</p><h2>关键里程碑</h2></div></div>{[["项目资料完成","已完成","green"],["方案结构确认","版本 2","green"],["章节编制","进行中","blue"],["成果导出","未开始","gray"]].map(([a,b,c]) => <div className={styles.milestone} key={a}><span className={styles.dot} /><strong>{a}</strong><Badge tone={c as "green"|"blue"|"gray"}>{b}</Badge></div>)}</section></div><section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.kicker}>章节进度</p><h2>方案内容</h2></div><Link className={styles.textLink} href="/demo/outline">查看方案结构</Link></div><div className={styles.chapterProgress}>{chapters.slice(0,4).map((c,i)=><div key={c.id}><span>{c.id}</span><div><strong>{c.title}</strong><p>{c.sections.length} 个子节</p></div><Badge tone={i===0?"green":i===1?"blue":"gray"}>{c.status}</Badge></div>)}</div></section></div>;
}

function Materials({ onAdd, onOpen }: { onAdd: () => void; onOpen: () => void }) {
  return <div className={styles.content}><PageHeader eyebrow="项目资料" title="资料清单" description="查看当前项目可用于方案编制的资料及采用状态。" action={<Button icon="plus" onClick={onAdd}>添加资料</Button>} /><section className={styles.completeness}><div className={styles.score}>82<small>%</small></div><div><h2>资料已满足方案结构生成条件</h2><p>项目背景与成果要求已齐备；仍有 2 项建议补充资料。</p></div><Badge tone="amber">待补充 2 项</Badge></section><div className={styles.materialGrid}><section className={styles.tableCard}><div className={`${styles.tableHead} ${styles.materialCols}`}><span>资料名称</span><span>采用状态</span><span>资料状态</span><span /></div>{materials.map((row,i)=><button className={`${styles.tableRow} ${styles.materialCols} ${styles.materialButton}`} key={row[0]} onClick={onOpen}><span className={styles.projectCell}><i><Icon name="file" size={16}/></i><span><strong>{row[0]}</strong><small>{row[1]}</small></span></span><span><Badge tone={i===3?"gray":"green"}>{row[2]}</Badge></span><span><Badge tone={i===1?"purple":"blue"}>{row[3]}</Badge></span><span><Icon name="arrow" size={15}/></span></button>)}</section><aside className={styles.sideCard}><p className={styles.kicker}>资料状态说明</p><h2>采用规则</h2><dl><div><dt>已采用</dt><dd>可作为当前项目事实依据</dd></div><div><dt>参考资料</dt><dd>仅参考结构与方法，不作为项目事实</dd></div><div><dt>待专业确认</dt><dd>需规划设计人员判断后采用</dd></div></dl></aside></div></div>;
}

function Outline({ editing, setEditing, openChapter, setOpenChapter, onSave, onConfirm }: { editing: boolean; setEditing: (v:boolean)=>void; openChapter:string; setOpenChapter:(v:string)=>void; onSave:()=>void; onConfirm:()=>void }) {
  return <div className={styles.content}><PageHeader eyebrow="动态方案结构" title={editing ? "编辑方案结构" : "结构总览"} description={editing ? "调整章节名称、顺序和子节，保存后再确认版本。" : "目录由当前项目资料动态生成，可从已确认子节进入编制。"} action={<div className={styles.actionGroup}><Badge tone="green">当前确认版本 2</Badge>{editing ? <><Button secondary onClick={()=>setEditing(false)}>退出编辑</Button><Button secondary onClick={onSave}>保存工作结构</Button><Button onClick={onConfirm}>确认方案结构</Button></> : <><Button secondary icon="edit" onClick={()=>setEditing(true)}>编辑结构</Button><Button icon="spark" onClick={()=>{}}>重新生成建议</Button></>}</div>} />
    {!editing && <section className={styles.aiSuggestion}><span><Icon name="spark" /></span><div><p className={styles.kicker}>AI建议结构</p><h3>A村典型村规划设计大纲</h3><p>建议已生成，应用后进入工作结构；不会覆盖已确认版本。</p></div><Button secondary>查看建议</Button></section>}
    <section className={styles.outlineList}>{chapters.map((chapter,i)=>{const open=openChapter===chapter.id; return <article className={styles.outlineChapter} key={chapter.id}><button className={styles.outlineSummary} onClick={()=>setOpenChapter(open?"":chapter.id)} aria-expanded={open}><span className={styles.chapterNo}>第 {i+1} 章</span><span className={styles.outlineName}>{editing?<input aria-label={`第${i+1}章名称`} defaultValue={chapter.title} onClick={e=>e.stopPropagation()}/>:<strong>{chapter.title}</strong>}<small>{chapter.sections.length} 个子节 · 资料状态正常</small></span><Badge tone={chapter.status==="已确认"?"green":chapter.status==="待补资料"?"amber":"blue"}>{chapter.status}</Badge><Icon name="chevron" /></button>{open&&<div className={styles.sectionList}>{chapter.sections.map((section,j)=><div key={section}><span>{i+1}.{j+1}</span>{editing?<input aria-label={`${section}名称`} defaultValue={section}/>:<strong>{section}</strong>}<Badge tone={i===0?"green":i===1&&j===1?"blue":"gray"}>{i===0?"已确认":i===1&&j===1?"编制中":"未开始"}</Badge>{editing?<div className={styles.miniActions}><button aria-label="上移">↑</button><button aria-label="下移">↓</button></div>:<Link className={styles.rowAction} href="/demo/chapters">进入编制<Icon name="arrow" size={14}/></Link>}</div>)}{editing&&<button className={styles.addRow}><Icon name="plus" size={15}/>新增子节</button>}</div>}</article>})}</section>
  </div>;
}

function Chapters({ copilotOpen, setCopilotOpen, draftApplied, onApply, onSave, onVersion }: { copilotOpen:boolean; setCopilotOpen:(v:boolean)=>void; draftApplied:boolean; onApply:()=>void; onSave:()=>void; onVersion:()=>void }) {
  return <div className={`${styles.chapterWorkspace} ${copilotOpen?styles.withCopilot:""}`}><div className={styles.chapterTop}><Link href="/demo/outline" className={styles.backLink}>← 返回方案结构</Link><div><strong>第2章 · 现状基础分析</strong><span>2.2 人口与社会经济</span></div><Badge tone={draftApplied?"amber":"green"}>{draftApplied?"有未保存修改":"已保存"}</Badge><button className={styles.button} onClick={()=>setCopilotOpen(!copilotOpen)}><Icon name="spark" size={16}/>AI助手</button></div><div className={styles.editorArea}><section className={styles.taskCard}><p className={styles.kicker}>当前子节任务</p><strong>分析人口结构、经济水平与主要产业，识别发展问题与趋势。</strong><span>依据 4 份项目资料 · 1 项待专业确认</span></section><article className={styles.document}><header><span>2.2</span><h1>人口与社会经济</h1><p>现状基础分析 · 工作草稿</p></header><div className={styles.richText} contentEditable suppressContentEditableWarning>{draftApplied?<><h2>人口结构与变化趋势</h2><p>A村常住人口呈现老龄化与劳动力外流并存的特征。结合现有资料，村庄人口规模总体保持稳定，但具体统计口径仍需进一步核实。</p><h2>产业发展基础</h2><p>村庄现状产业以传统农业为主，具有一定的特色种植基础。后续应围绕产业链延伸、村民增收与集体经济培育形成发展策略。</p></>:<p className={styles.placeholder}>从右侧生成并应用AI建议，或直接在这里开始编写正文……</p>}</div><footer><span>{draftApplied?186:0} 字</span><div><Button secondary onClick={onSave}>保存草稿</Button><Button onClick={onVersion}>创建版本快照</Button></div></footer></article></div>{copilotOpen&&<Copilot onClose={()=>setCopilotOpen(false)} onApply={onApply}/>}</div>;
}

function Copilot({ onClose, onApply }: { onClose:()=>void; onApply:()=>void }) {
  return <aside className={styles.copilot}><header><div><span><Icon name="spark"/></span><div><strong>规策 Copilot</strong><small>当前：人口与社会经济</small></div></div><button className={styles.iconButton} aria-label="关闭AI助手" onClick={onClose}><Icon name="close"/></button></header><div className={styles.copilotTabs}><button className={styles.tabActive}>AI建议</button><button>资料依据</button><button>历史版本</button></div><div className={styles.copilotBody}><Badge tone="blue">建议稿已生成</Badge><h2>人口与社会经济</h2><p className={styles.summary}>基于当前项目资料形成现状分析草稿，未确认数据已按“待补充”处理。</p><div className={styles.preview}><h3>建议内容预览</h3><p>A村人口结构呈现老龄化趋势，劳动力外流对产业发展和公共服务配置形成影响……</p><p>现状产业仍以传统农业为主，可围绕特色种植与村集体经济培育后续策略……</p></div><div className={styles.copilotFacts}><p><strong>资料依据</strong><span>4 项</span></p><p><strong>待补充资料</strong><span>2 项</span></p><p><strong>待专业确认</strong><span>1 项</span></p></div><Button onClick={onApply}>应用到草稿</Button><button className={styles.regenerate}><Icon name="spark" size={15}/>重新生成建议</button></div><div className={styles.copilotInput}><input aria-label="补充要求" placeholder="补充写作要求…"/><button aria-label="发送"><Icon name="send" size={17}/></button></div></aside>;
}

function Review({ resolved, onResolve }: { resolved:boolean; onResolve:()=>void }) {
  const issues = resolved ? 2 : 3;
  return <div className={styles.content}><PageHeader eyebrow="内容校核" title="校核中心" description="检查事实、表达与专业判断，确认前处理必须处理问题。" action={<Button icon="check">再次校核</Button>} /><section className={`${styles.reviewBanner} ${resolved?styles.reviewGood:""}`}><span><Icon name={resolved?"check":"clock"}/></span><div><h2>{resolved?"必须处理问题已解决":"当前子节暂不能确认"}</h2><p>{resolved?"可继续处理待专业确认事项，或确认当前子节。":"存在 1 项必须处理问题，处理后方可确认当前子节。"}</p></div><Badge tone={resolved?"green":"red"}>{issues} 项未处理</Badge></section><div className={styles.reviewGrid}><aside className={styles.issueList}><button className={styles.issueActive}><Badge tone={resolved?"green":"red"}>{resolved?"已处理":"必须处理"}</Badge><strong>人口统计口径不一致</strong><span>正文中的人口数据与任务书不一致</span></button><button><Badge tone="amber">建议优化</Badge><strong>表述可以更精炼</strong><span>合并两处重复的产业现状描述</span></button><button><Badge tone="purple">待专业确认</Badge><strong>人口发展趋势判断</strong><span>缺少可验证依据，需要规划师判断</span></button></aside><section className={styles.issueDetail}><div className={styles.sectionTitle}><div><p className={styles.kicker}>问题详情</p><h2>人口统计口径不一致</h2></div><Badge tone={resolved?"green":"red"}>{resolved?"已处理":"必须处理"}</Badge></div><div className={styles.quote}>“A村现状常住人口为 1,260 人，近五年保持稳定。”</div><dl className={styles.issueMeta}><div><dt>发现依据</dt><dd>项目任务书记录为 1,180 人；会议纪要说明需采用最新统计口径。</dd></div><div><dt>处理建议</dt><dd>暂不写入确定数值，改为说明现状趋势，并将人口数据列为待补资料。</dd></div><div><dt>业务影响</dt><dd>该问题会阻止当前子节确认。</dd></div></dl><div className={styles.reviewActions}><Button secondary>生成AI修订建议</Button><Button onClick={onResolve} disabled={resolved}>{resolved?"已标记处理":"标记为已处理"}</Button></div></section></div></div>;
}

function Deliverables({ onExport }: { onExport:()=>void }) {
  return <div className={styles.content}><PageHeader eyebrow="成果与版本" title="项目成果" description="汇总已确认内容、未处理事项与可导出成果。" action={<Button icon="export" onClick={onExport}>导出 Word</Button>} /><div className={styles.metrics}>{[["已确认子节","2","green"],["编制中","3","blue"],["必须处理","1","red"],["待专业确认","2","purple"]].map(([a,b,c])=><article className={styles.metric} key={a}><span>{a}</span><strong>{b}</strong><i className={styles[`metric_${c}`]}/></article>)}</div><div className={styles.deliverableGrid}><section className={styles.tableCard}><div className={`${styles.tableHead} ${styles.deliverableCols}`}><span>章节与子节</span><span>当前状态</span><span>最新版本</span><span /></div>{[["1.1 项目背景","已确认","V2"],["1.2 规划范围与期限","已确认","V1"],["2.1 区位与交通条件","编制中","草稿"],["2.2 人口与社会经济","必须处理","V3"],["3.1 总体定位","等待前置内容","—"]].map((r,i)=><div className={`${styles.tableRow} ${styles.deliverableCols}`} key={r[0]}><span><strong>{r[0]}</strong></span><span><Badge tone={i<2?"green":i===2?"blue":i===3?"red":"gray"}>{r[1]}</Badge></span><span>{r[2]}</span><span>{i<2?<button className={styles.iconButton} aria-label="选择导出"><Icon name="check" size={15}/></button>:null}</span></div>)}</section><aside className={styles.sideStack}><section className={styles.sideCard}><p className={styles.kicker}>导出范围</p><h2>仅包含已确认内容</h2><p>当前可导出第1章的 2 个已确认子节；草稿和未处理内容不会混入成果。</p></section><section className={styles.sideCard}><p className={styles.kicker}>未处理事项</p><h2>3 项需要关注</h2><div className={styles.compactIssue}><Badge tone="red">1</Badge><span>必须处理</span></div><div className={styles.compactIssue}><Badge tone="purple">2</Badge><span>待专业确认</span></div></section></aside></div></div>;
}

function Settings({ onSave }: { onSave:()=>void }) {
  return <div className={styles.content}><PageHeader eyebrow="系统设置" title="工作台设置" description="调整演示工作台的基础偏好与AI助手呈现方式。" action={<Button onClick={onSave}>保存设置</Button>} /><div className={styles.settingsLayout}><aside className={styles.settingsNav}><button className={styles.settingsActive}>通用设置</button><button>AI助手</button><button>通知与提醒</button><button>关于系统</button></aside><section className={styles.settingsPanel}><div className={styles.settingsSection}><h2>通用设置</h2><p>设置项目列表和工作台的默认显示方式。</p><label className={styles.field}>默认进入页面<select defaultValue="dashboard"><option value="dashboard">工作台</option><option value="projects">项目库</option></select></label><label className={styles.field}>界面密度<select defaultValue="comfortable"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label></div><div className={styles.settingsSection}><h2>AI助手</h2><p>控制AI建议的呈现方式，不影响业务数据。</p><Toggle label="进入章节编制时打开AI助手" defaultChecked /><Toggle label="应用AI建议前二次确认" defaultChecked /><Toggle label="显示资料依据与待确认事项" defaultChecked /></div></section></div></div>;
}

function Toggle({ label, defaultChecked }: { label:string; defaultChecked?:boolean }) {
  return <label className={styles.toggleRow}><span>{label}</span><input type="checkbox" defaultChecked={defaultChecked}/><i aria-hidden="true"/></label>;
}
