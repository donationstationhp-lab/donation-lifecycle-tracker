import {
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Package,
  Search,
  Globe,
} from "lucide-react";
import {
  getGetPublicTrackingQueryKey,
  useRequestPublicTrackingVerification,
  useGetPublicTracking,
  useVerifyPublicTracking,
  type PublicTrackingResponse,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicTrack({ trackingCode }: { trackingCode: string }) {
  const [verifiedData, setVerifiedData] = useState<PublicTrackingResponse | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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
  const requestVerification = useRequestPublicTrackingVerification({
    mutation: {
      onSuccess: (result) => {
        setVerificationOpen(true);
        setMessage(result.message);
        setErrorMessage("");
      },
      onError: (error) => {
        setErrorMessage(getApiErrorMessage(error, "We could not send a verification code."));
      },
    },
  });
  const verifyTracking = useVerifyPublicTracking({
    mutation: {
      onSuccess: (result) => {
        setVerifiedData(result);
        setVerificationOpen(false);
        setMessage("");
        setErrorMessage("");
      },
      onError: (error) => {
        setErrorMessage(getApiErrorMessage(error, "That code could not be verified."));
      },
    },
  });
  const visibleData = (verifiedData ?? data)!;

  return (
    <main className="flex-1 w-full bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-8 animate-fade-in">
        <header className="text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Globe className="h-7 w-7" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
            W.O.W. Operating System
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Public Tracking
          </h1>
          <p className="mt-3 text-sm text-muted-foreground font-medium max-w-md mx-auto">
            Receive the resource. Gain the truth. Give with proof.
            <br/>
            <span className="font-normal opacity-80 mt-1 inline-block">
              This page shows public-safe service progress. Exact times remain locked to protect identities.
              Donation Station receives, verifies, schedules, and gives with proof.
              Acknowledgement received. Appreciation gained. Gratitude given.
            </span>
          </p>
        </header>

        {isError ? (
          <Card className="border-destructive/20 shadow-sm bg-destructive/5">
            <CardContent className="py-10 text-center">
              <p className="font-semibold text-destructive text-lg">
                We could not find that tracking code.
              </p>
              <p className="mt-2 text-sm text-muted-foreground font-medium">
                Check the code and try the tracking link again.
              </p>
            </CardContent>
          </Card>
        ) : isLoading || !data ? (
          <Card className="shadow-md border-border">
            <CardContent className="space-y-6 py-8">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden shadow-md border-border transition-all">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                      Tracking Code
                    </p>
                    <CardTitle className="font-mono text-2xl tracking-wider text-foreground">
                      {data.trackingCode}
                    </CardTitle>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Claim Status
                    </p>
                    <Badge className="px-4 py-1.5 text-sm font-bold shadow-sm">{data.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 py-6">
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground border border-border/50">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Item Category
                      </p>
                      <p className="font-semibold text-foreground text-sm">
                        {data.item.categoryLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 sm:pl-4 sm:border-l sm:border-border/50">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Sanitized Item Name
                      </p>
                      <p className="font-semibold text-foreground text-sm">
                        {data.item.name}
                      </p>
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 px-2">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                      Current Service Stage
                    </dt>
                    <dd className="font-bold text-foreground text-base capitalize">{data.stage}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                       {visibleData.lastUpdatedExact ? "Last Updated Exact" : "Last Updated Approx"}
                    </dt>
                    <dd className="font-bold text-foreground text-base">
                       {visibleData.lastUpdatedExact ?? visibleData.lastUpdatedApprox}
                    </dd>
                  </div>
                </dl>

                 <div className={`flex items-center gap-4 rounded-xl border p-4 ${
                   visibleData.exactTimesLocked
                     ? "border-amber-200/60 bg-amber-500/10 text-amber-900 dark:text-amber-400"
                     : "border-emerald-200/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-400"
                 }`}>
                  <div className="bg-amber-500/20 p-2 rounded-lg shrink-0">
                     {visibleData.exactTimesLocked ? (
                       <LockKeyhole className="h-5 w-5" />
                     ) : (
                       <CheckCircle2 className="h-5 w-5" />
                     )}
                  </div>
                  <div>
                     <p className="text-sm font-bold tracking-tight">
                       {visibleData.exactTimesLocked ? "Exact time locked" : "Verified access"}
                     </p>
                     <p className="text-xs font-medium opacity-80 mt-0.5">
                       {visibleData.exactTimesLocked
                         ? "Verify to view exact times"
                         : "Exact service times are now visible"}
                     </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold">Claim timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-6">
                   {(visibleData.timeline ?? []).map((entry, index) => (
                    <li key={`${entry.label}-${entry.approx}-${index}`} className="flex gap-4 relative">
                      {/* Line connector */}
                      {index < (visibleData.timeline ?? []).length - 1 && (
                        <div className="absolute left-3 top-8 bottom-[-24px] w-px bg-border"></div>
                      )}

                      <div className="mt-0.5 relative z-10 bg-card rounded-full">
                        {index === (visibleData.timeline ?? []).length - 1 ? (
                          <div className="bg-primary/10 rounded-full p-1 border border-primary/20">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </div>
                        ) : (
                          <div className="bg-muted rounded-full p-1 border border-border">
                            <Clock3 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="pb-2">
                        <p className={`font-bold ${index === (visibleData.timeline ?? []).length - 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {entry.label}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground/70 mt-1">
                           {entry.exact ?? entry.approx}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

             {visibleData.exactTimesLocked && (
               <div className="space-y-3 pt-2">
                 {!verificationOpen ? (
                   <>
                     <Button
                       className="w-full h-12 text-sm font-bold tracking-wide shadow-sm"
                       onClick={() => {
                         setMessage("");
                          setErrorMessage("");
                         requestVerification.mutate({ trackingCode });
                       }}
                       disabled={requestVerification.isPending}
                     >
                       <LockKeyhole className="mr-2 h-4 w-4" />
                       {requestVerification.isPending ? "Sending code…" : "Verify to view exact times"}
                     </Button>
                     <p className="text-center text-xs font-medium text-muted-foreground">
                       We’ll send a six-digit code to the phone number on file.
                     </p>
                      {errorMessage && (
                        <p className="text-sm font-medium text-destructive" role="alert">{errorMessage}</p>
                      )}
                   </>
                 ) : (
                   <Card className="border-primary/20 bg-primary/5">
                     <CardContent className="space-y-4 p-5">
                       <div>
                         <p className="font-bold text-foreground">Enter your verification code</p>
                         <p className="mt-1 text-sm text-muted-foreground">
                           {message || "The code expires in 10 minutes."}
                         </p>
                       </div>
                       <div className="flex gap-3">
                         <Input
                           value={code}
                           onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                           inputMode="numeric"
                           autoComplete="one-time-code"
                           placeholder="000000"
                           aria-label="Six-digit verification code"
                           className="h-12 text-center font-mono text-xl tracking-[0.35em]"
                         />
                         <Button
                           className="h-12 shrink-0"
                           onClick={() => verifyTracking.mutate({ trackingCode, data: { code } })}
                           disabled={code.length !== 6 || verifyTracking.isPending}
                         >
                           {verifyTracking.isPending ? "Checking…" : "Verify"}
                         </Button>
                       </div>
                        {errorMessage && !verifyTracking.isPending && (
                          <p className="text-sm font-medium text-destructive" role="alert">{errorMessage}</p>
                       )}
                       <button
                         type="button"
                         className="text-xs font-bold text-primary underline underline-offset-4 disabled:opacity-50"
                         onClick={() => {
                           setMessage("");
                            setErrorMessage("");
                           requestVerification.mutate({ trackingCode });
                         }}
                         disabled={requestVerification.isPending}
                       >
                         Resend code
                       </button>
                     </CardContent>
                   </Card>
                 )}
               </div>
             )}
          </>
        )}
      </div>
    </main>
  );
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const response = error as {
    data?: { error?: string; retryAfterSeconds?: number };
  };
  const message = response.data?.error;
  if (!message) return fallback;
  const retryAfterSeconds = response.data?.retryAfterSeconds;
  return retryAfterSeconds
    ? `${message}. Try again in about ${retryAfterSeconds} seconds.`
    : message;
}
