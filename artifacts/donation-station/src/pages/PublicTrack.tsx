import {
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Package,
  Search,
} from "lucide-react";
import {
  getGetPublicTrackingQueryKey,
  useGetPublicTracking,
  type PublicTrackingResponse,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicTrack({ trackingCode }: { trackingCode: string }) {
  const {
    data,
    isLoading,
    isError,
  } = useGetPublicTracking<PublicTrackingResponse>(trackingCode, {
    query: {
      queryKey: getGetPublicTrackingQueryKey(trackingCode),
      retry: false,
      staleTime: 30_000,
    },
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Donation Station
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Track your claim
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Public updates exclude donor, recipient, and contact information.
          </p>
        </header>

        {isError ? (
          <Card className="border-red-200 shadow-sm">
            <CardContent className="py-10 text-center">
              <p className="font-semibold text-red-700">
                We could not find that tracking code.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Check the code and try the tracking link again.
              </p>
            </CardContent>
          </Card>
        ) : isLoading || !data ? (
          <Card className="shadow-sm">
            <CardContent className="space-y-4 py-8">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Tracking code
                    </p>
                    <CardTitle className="mt-1 font-mono text-2xl tracking-wide">
                      {data.trackingCode}
                    </CardTitle>
                  </div>
                  <Badge className="px-3 py-1 text-sm">{data.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 py-6">
                <div className="flex gap-4 rounded-xl border bg-slate-50 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-primary shadow-sm">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {data.item.categoryLabel}
                    </p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {data.item.name}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Current stage
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900">{data.stage}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Last updated
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {data.lastUpdatedApprox}
                    </dd>
                  </div>
                </dl>

                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <LockKeyhole className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Exact time: Locked</p>
                    <p className="text-xs text-amber-800">
                      Verification access is coming soon.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Claim timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-5">
                  {data.timeline.map((entry, index) => (
                    <li key={`${entry.label}-${entry.approx}-${index}`} className="flex gap-3">
                      <div className="mt-0.5">
                        {index === data.timeline.length - 1 ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <Clock3 className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{entry.label}</p>
                        <p className="text-sm text-slate-500">{entry.approx}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Button disabled className="w-full">
              <LockKeyhole className="mr-2 h-4 w-4" />
              SMS verification coming soon
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
