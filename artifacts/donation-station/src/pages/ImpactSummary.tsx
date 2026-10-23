import { BarChart3, CheckCircle2, Clock3, Package, Truck } from "lucide-react";
import {
  useGetPublicImpactSummary,
  type PublicImpactSummary,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-4 p-6">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatFulfillmentTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return "<1 hr";
  if (hours < 48) return `${Math.round(hours)} hrs`;
  return `${Math.round(hours / 24)} days`;
}

export default function ImpactSummary() {
  const { data, isLoading, isError } = useGetPublicImpactSummary<PublicImpactSummary>({
    query: {
      staleTime: 60_000,
    },
  });

  return (
    <main className="flex-1 w-full bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-8 animate-fade-in">
        <header className="text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Our Impact
          </h1>
          <p className="mt-3 text-sm text-muted-foreground font-medium max-w-md mx-auto">
            A live look at what Donation Station has moved, matched, and delivered.
          </p>
        </header>

        {isError ? (
          <Card className="border-destructive/20 shadow-sm bg-destructive/5">
            <CardContent className="p-6 text-center text-sm font-medium text-destructive">
              We couldn't load impact numbers right now. Please try again later.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isLoading || !data ? (
                <>
                  <StatSkeleton />
                  <StatSkeleton />
                  <StatSkeleton />
                  <StatSkeleton />
                </>
              ) : (
                <>
                  <StatCard icon={Package} label="Items received" value={data.totalItemsReceived.toLocaleString()} />
                  <StatCard icon={Truck} label="Items distributed" value={data.totalItemsDistributed.toLocaleString()} />
                  <StatCard icon={CheckCircle2} label="Claims fulfilled" value={data.claimsFulfilled.toLocaleString()} />
                  <StatCard icon={Clock3} label="Avg. fulfillment time" value={formatFulfillmentTime(data.averageFulfillmentHours)} />
                </>
              )}
            </div>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Items by category</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ) : data.itemsByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.itemsByCategory.map((category) => {
                      const max = Math.max(...data.itemsByCategory.map((c) => c.count), 1);
                      const widthPercent = Math.max(4, Math.round((category.count / max) * 100));
                      return (
                        <li key={category.categoryLabel} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 truncate text-sm font-medium text-foreground">
                            {category.categoryLabel}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${widthPercent}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-sm font-semibold text-foreground">
                            {category.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
