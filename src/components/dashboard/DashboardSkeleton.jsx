import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-3 w-28 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-full" />
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>
      </div>

      {/* Economics strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0,1,2].map(i => (
          <div key={i} className="p-4 rounded-xl border border-border/40 bg-card">
            <Skeleton className="h-3 w-40 mb-2 rounded-md" />
            <Skeleton className="h-6 w-28 rounded-md" />
          </div>
        ))}
      </div>

      {/* Hero savings / big card */}
      <div className="rounded-2xl border border-border/40 bg-card p-4">
        <Skeleton className="h-5 w-56 mb-3 rounded-md" />
        <Skeleton className="h-9 w-40 mb-4 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0,1,2].map(i => (
            <div key={i} className="p-3 rounded-xl border border-border/30 bg-secondary/40">
              <Skeleton className="h-4 w-24 mb-2 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3">
        {[0,1,2].map(i => (
          <div key={i} className="p-4 rounded-2xl border border-border/40 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-6 w-6 rounded-lg" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-3 w-32 mt-2 rounded-md hidden sm:block" />
          </div>
        ))}
      </div>

      {/* Row: chart / infra score (or deals) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0,1].map(i => (
          <div key={i} className="p-4 rounded-2xl border border-border/40 bg-card">
            <Skeleton className="h-4 w-40 mb-3 rounded-md" />
            <Skeleton className="h-44 w-full rounded-md" />
          </div>
        ))}
      </div>

      {/* Infrastructure status */}
      <div className="p-4 rounded-2xl border border-border/40 bg-card">
        <Skeleton className="h-4 w-48 mb-3 rounded-md" />
        <div className="space-y-2">
          {[0,1,2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-16 ml-auto rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-2xl bg-card/50 border border-border/40 p-4 mt-3">
        <Skeleton className="h-4 w-40 mb-3 rounded-md" />
        <div className="space-y-3">
          {[0,1,2].map(i => (
            <div key={i} className="p-4 rounded-xl border border-border/40 bg-secondary/30">
              <Skeleton className="h-4 w-64 mb-2 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}