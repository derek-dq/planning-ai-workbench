import Link from "next/link";

export default function DashboardPage() {
  return <div className="content-page"><header className="page-header"><div><p className="eyebrow">工作台</p><h1>项目工作入口</h1><p>规策AI工作台为规划技术方案编制提供清晰的项目边界与工作入口。</p></div><Link className="button" href="/projects">进入项目库</Link></header><section className="grid-two"><article className="info-card"><h2>开始一个项目</h2><p>本批仅建立应用壳、正式路由和静态演示项目骨架。本地项目数据将在后续任务接入。</p></article><article className="info-card"><h2>当前演示项目</h2><p>南桥街道A村典型村规划设计</p><Link href="/projects/a-village/workbench/overview">查看项目总览 →</Link></article></section></div>;
}
