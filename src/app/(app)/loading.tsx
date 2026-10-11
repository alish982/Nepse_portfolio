export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-8">
      <div className="skeleton h-12 w-64" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
