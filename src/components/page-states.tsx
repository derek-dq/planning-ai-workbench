export function EmptyState({ title, description }: { title: string; description: string }) {
  return <section className="state-card"><h2>{title}</h2><p>{description}</p></section>;
}

export function ErrorState({ title, description }: { title: string; description: string }) {
  return <section className="state-card error"><h2>{title}</h2><p>{description}</p></section>;
}
