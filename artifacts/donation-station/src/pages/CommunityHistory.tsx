import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  HeartHandshake,
  History,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserButton } from "@clerk/react";

type StatusHistoryEntry = {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  timestamp: string;
};

type CommunityHistory = {
  donations: Array<{
    id: string;
    itemId: string;
    name: string;
    category: string;
    stage: string;
    createdAt: string;
    updatedAt: string;
  }>;
  claims: Array<{
    id: string;
    trackingCode: string | null;
    itemId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    history: StatusHistoryEntry[];
  }>;
  appointments: Array<{
    id: string;
    appointmentType: string;
    relatedClaimId: string | null;
    relatedItemId: string | null;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    station: { id: string; code: string; zone: string } | null;
    history: StatusHistoryEntry[];
  }>;
  reservations: Array<{
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    relatedClaimId: string | null;
  }>;
  volunteerRequests: Array<{
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
  }>;
  pickups: Array<{
    id: string;
    status: string;
    requestedWindow: string;
    confirmedDatetime: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  acknowledgments: Array<{
    id: string;
    status: string;
    summary: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  history: Array<{
    recordType: string;
    recordId: string;
    label: string;
    status: string;
    timestamp: string;
  }>;
  ownership: { linkedRecords: number; staffMediated: boolean };
};

const labels: Record<string, string> = {
  donation_dropoff: "Donation drop-off",
  donation_pickup: "Donation pickup",
  receiver_pickup: "Resource pickup",
  reserve_item_pickup: "Item reservation",
  volunteer_shift: "Volunteer request",
  donation_market: "Community market",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function SummaryCard({
  title,
  count,
  icon: Icon,
}: {
  title: string;
  count: number;
  icon: typeof Package;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{count}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityHistory() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["community-history"],
    queryFn: () => customFetch<CommunityHistory>("/api/community/history", { responseType: "json" }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="py-12 text-center">
          <p className="font-semibold text-destructive">Your service history could not be loaded.</p>
          <p className="mt-2 text-sm text-muted-foreground">Please try again or ask staff to help with your account.</p>
        </CardContent>
      </Card>
    );
  }

  const hasRecords = data.ownership.linkedRecords > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Private community view</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">My service history</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
            See the donations, requests, appointments, and acknowledgments that staff have verified as yours.
          </p>
        </div>
        <UserButton />
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-200/60 bg-emerald-500/10 p-4 text-emerald-950 dark:text-emerald-300">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-bold">Your records are identity-protected</p>
          <p className="mt-1 text-xs font-medium opacity-80">
            This page uses your signed-in identity. A tracking code by itself never unlocks personal history.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Donations" count={data.donations.length} icon={Package} />
        <SummaryCard title="Requests" count={data.claims.length} icon={FileText} />
        <SummaryCard title="Appointments" count={data.appointments.length} icon={CalendarDays} />
        <SummaryCard title="Acknowledgments" count={data.acknowledgments.length} icon={HeartHandshake} />
      </div>

      {!hasRecords ? (
        <Card className="border-dashed shadow-sm">
          <CardContent className="py-14 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-4 text-lg font-bold">No verified records yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Public submissions remain unlinked until staff verify ownership. Ask a Donation Station staff member to
              link an eligible record to your signed-in account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-primary" />
                Status history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your linked records do not have status updates yet.</p>
              ) : (
                <ol className="space-y-5">
                  {data.history.map((entry, index) => (
                    <li key={`${entry.recordType}-${entry.recordId}-${entry.timestamp}-${index}`} className="relative flex gap-3">
                      {index < data.history.length - 1 && <span className="absolute left-2 top-6 h-7 w-px bg-border" />}
                      <span className="relative z-10 mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                        {index === 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold capitalize">{entry.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Package className="h-5 w-5 text-primary" />Donations</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.donations.length === 0 ? <p className="text-sm text-muted-foreground">No linked donations.</p> : data.donations.map((donation) => (
                  <div key={donation.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{donation.name}</p><p className="text-xs text-muted-foreground">{donation.category}</p></div>
                    <Badge variant="secondary" className="capitalize">{statusLabel(donation.stage)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />Requests</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.claims.length === 0 ? <p className="text-sm text-muted-foreground">No linked requests.</p> : data.claims.map((claim) => (
                  <div key={claim.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div><p className="text-sm font-semibold">{claim.trackingCode ?? "Request"}</p><p className="text-xs text-muted-foreground">{formatDate(claim.updatedAt)}</p></div>
                    <Badge className="capitalize">{statusLabel(claim.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" />Appointments</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.appointments.length === 0 ? <p className="text-sm text-muted-foreground">No linked appointments.</p> : data.appointments.map((appointment) => (
                  <div key={appointment.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-4"><p className="text-sm font-semibold">{labels[appointment.appointmentType] ?? "Appointment"}</p><Badge variant="secondary" className="capitalize">{statusLabel(appointment.status)}</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(appointment.scheduledStart)}{appointment.station ? ` · ${appointment.station.code}` : ""}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Truck className="h-5 w-5 text-primary" />Reservations & volunteer requests</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[...data.reservations.map((item) => ({ ...item, label: "Reservation" })), ...data.volunteerRequests.map((item) => ({ ...item, label: "Volunteer request" }))].length === 0 ? (
                  <p className="text-sm text-muted-foreground">No linked reservations or volunteer requests.</p>
                ) : [...data.reservations.map((item) => ({ ...item, label: "Reservation" })), ...data.volunteerRequests.map((item) => ({ ...item, label: "Volunteer request" }))].map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-muted-foreground">{formatDate(item.scheduledStart)}</p></div>
                    <Badge variant="secondary" className="capitalize">{statusLabel(item.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}