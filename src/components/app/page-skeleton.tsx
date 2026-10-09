export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 rounded bg-line" />
      <div className="h-11 w-80 max-w-full rounded-lg bg-line" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-[14px] bg-line/70" />
        <div className="h-28 rounded-[14px] bg-line/70" />
        <div className="h-28 rounded-[14px] bg-line/70" />
      </div>
      <div className="h-64 rounded-[14px] bg-line/60" />
    </div>
  );
}
