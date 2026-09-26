/** Stands in for pages that later tasks build, so every sidebar link has somewhere to go. */
export function PlaceholderPage({ title, task }: { title: string; task: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">{task}</span>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted">This page is coming soon.</p>
    </div>
  );
}
