export default function Loading() {
  return (
    <div role="status" aria-label="Loading research workspace" className="animate-pulse">
      <div className="mb-3 h-8 w-72 rounded bg-muted" />
      <div className="mb-8 h-3 w-96 max-w-full rounded bg-muted" />
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div className="panel h-32 bg-muted/20" key={i} />
        ))}
      </div>
      <div className="panel h-80 bg-muted/20" />
    </div>
  );
}
