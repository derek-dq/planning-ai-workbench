export function WorkbenchPlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="placeholder-card"><p className="eyebrow">Foundation 路由占位</p><h1>{title}</h1><p>{description}</p><span className="status-chip muted">当前切片暂未实现业务功能</span></section>;
}
