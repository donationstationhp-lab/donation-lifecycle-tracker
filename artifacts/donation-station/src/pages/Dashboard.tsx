import { useGetDashboard } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';
import {
  AlertTriangle, ArrowRight, TrendingUp, Clock, Heart, ExternalLink,
  ClipboardCheck, CalendarCheck, ShieldAlert, Globe, Zap, Recycle, Leaf,
  CheckCircle2, Package
} from 'lucide-react';
import { TierBadge, StageChip, ConditionChip } from '@/components/shared';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

type WowMetrics = {
  resourcesReceived: number;
  requestsReceived: number;
  claimsVerified: number;
  resourcesVerified: number;
  resourcesReserved: number;
  appointmentsScheduled: number;
  resourcesDistributed: number;
  wasteDiverted: number;
  appointmentsCompleted: number;
  noShows: number;
  acknowledgmentsReceived: number;
  acknowledgmentsPending: number;
  acknowledgmentsSent: number;
  receiveToGiveHours: number | null;
};

type ServiceMetrics = {
  receivedToday: number;
  receivedThisWeek: number;
  scheduledToday: number;
  overdue: number;
  pendingVerification: number;
  reservedItems: number;
  wowMetrics: WowMetrics;
};

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  const dashboardData = summary as typeof summary & { serviceMetrics?: ServiceMetrics };
  const serviceMetrics = dashboardData?.serviceMetrics;
  const wowMetrics = serviceMetrics?.wowMetrics;

  const pendingCount = summary?.pendingReviewCount ?? 0;
  const donateUrl = `${window.location.origin}/donation-station/donate`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-xl w-full" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20 font-medium">
        Failed to load operations dashboard. Please try again.
      </div>
    );
  }

  const maxTierCount = Math.max(...summary.byTier.map(t => t.count), 1);

  return (
    <div className="space-y-12 animate-fade-in pb-12">
      {/* Brand Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            W.O.W. Universal Servicing OS
          </h1>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mt-2">
            War On Waste / We All Stop Trashing Earth
          </p>
          <p className="text-sm text-muted-foreground font-medium mt-2">
            Acknowledgement received. Appreciation gained. Gratitude given.
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-xs font-mono font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full inline-flex items-center gap-2 border border-primary/20 shadow-sm">
            <Zap className="w-3.5 h-3.5" />
            Receive. Gain. Give.
          </p>
        </div>
      </div>

      {/* Expanded Doctrine */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center shadow-sm">
        <p className="text-xs sm:text-sm font-mono font-medium text-primary uppercase tracking-widest leading-relaxed">
          Receive &rarr; Gain &rarr; Give &rarr; Build &rarr; Focus &rarr; Create &rarr; Master Build &rarr; Construct Bridging &rarr; Form Relationships &rarr; Universally Service
        </p>
      </div>

      {/* Receiving */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Receiving
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Receive what is.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                Total Active Items
                <Package className="w-4 h-4 text-primary/50" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">{summary.totalActiveItems}</div>
              <p className="text-xs font-medium text-muted-foreground mt-1">In system currently</p>
            </CardContent>
          </Card>

          <Card className={`shadow-sm transition-all hover-elevate cursor-pointer ${summary.expiringCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-card border-border'}`}>
            <Link href="/expiring" className="block">
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold uppercase tracking-wider flex justify-between items-center ${summary.expiringCount > 0 ? 'text-orange-800' : 'text-muted-foreground'}`}>
                  Expiring Soon
                  <AlertTriangle className={`w-4 h-4 ${summary.expiringCount > 0 ? 'text-orange-500 animate-pulse' : 'text-primary/30'}`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${summary.expiringCount > 0 ? 'text-orange-600' : 'text-foreground'}`}>
                  {summary.expiringCount}
                </div>
                <p className={`text-xs font-medium mt-1 ${summary.expiringCount > 0 ? 'text-orange-700' : 'text-muted-foreground'}`}>
                  Within 14 days
                </p>
              </CardContent>
            </Link>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Resources Received</div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.resourcesReceived ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requests Received</div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.requestsReceived ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Acknowledgements Received</div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.acknowledgmentsReceived ?? '—'}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Share Donate Link banner */}
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 px-6 py-5 flex flex-col justify-center gap-5 shadow-sm h-full">
            <div className="flex items-center gap-4 flex-1">
              <div className="bg-primary/10 rounded-full p-2.5 shrink-0">
                <Heart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Donor Intake Form</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Share this link with donors so they can submit items directly.
                </p>
                <p className="text-xs font-mono font-medium text-primary mt-1.5 break-all bg-background px-2 py-1 rounded-md border border-primary/10 inline-block">{donateUrl}</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 w-full sm:w-auto font-semibold" onClick={() => navigator.clipboard?.writeText(donateUrl)}>
                Copy Link
              </Button>
              <a href={donateUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto block">
                <Button size="sm" className="w-full sm:w-auto gap-1.5 font-semibold shadow-sm">
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
          </div>

          <Card className="shadow-sm border-border flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">Recent Intakes</CardTitle>
                <CardDescription>Latest items logged into the system</CardDescription>
              </div>
              <Link href="/items">
                <Button variant="ghost" size="sm" className="flex items-center gap-1 text-primary hover:text-primary/80 hover:bg-primary/10">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <div className="divide-y divide-border/50 -mx-6 px-6 max-h-[220px] overflow-y-auto">
                {summary.recentItems.map((item) => (
                  <Link key={item.id} href={`/items/${item.id}`} className="block py-4 hover:bg-muted/30 transition-colors -mx-2 px-2 rounded-lg group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TierBadge tier={item.tier} />
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                            {item.name}
                            <span className="text-[10px] font-mono font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border/50">
                              {item.itemId}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-2 items-center font-medium">
                            <span>{item.category}</span>
                            <span className="text-border">•</span>
                            <span>{format(new Date(item.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <StageChip stage={item.stage} />
                        <ConditionChip condition={item.condition} />
                      </div>
                    </div>
                  </Link>
                ))}
                {summary.recentItems.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 opacity-20" />
                    <span className="font-medium text-sm">No recent items found.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Gaining */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Gaining
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Gain what it means.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={`shadow-sm transition-all hover-elevate cursor-pointer ${pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-card border-border'}`}>
            <Link href="/pending" className="block">
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold uppercase tracking-wider flex justify-between items-center ${pendingCount > 0 ? 'text-amber-800' : 'text-muted-foreground'}`}>
                  Due Diligence Review
                  <Clock className={`w-4 h-4 ${pendingCount > 0 ? 'text-amber-500 animate-pulse' : 'text-primary/30'}`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                  {pendingCount}
                </div>
                <p className={`text-xs font-medium mt-1 ${pendingCount > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {pendingCount === 1 ? 'Submission pending' : 'Submissions pending'}
                </p>
              </CardContent>
            </Link>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4 flex flex-col h-full justify-center">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary/70" />
                Verified Resources
              </div>
              <div className="text-4xl font-bold text-foreground">{wowMetrics?.resourcesVerified ?? '—'}</div>
              <p className="text-xs text-muted-foreground mt-1 font-medium leading-tight">Successfully verified</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4 flex flex-col h-full justify-center">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary/70" />
                Claims Verified
              </div>
              <div className="text-4xl font-bold text-foreground">{wowMetrics?.claimsVerified ?? '—'}</div>
              <p className="text-xs text-muted-foreground mt-1 font-medium leading-tight">Due diligence completed</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Giving */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Recycle className="w-5 h-5 text-primary" />
            Giving
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Give what completes.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/5 col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                Items Distributed
                <TrendingUp className="w-4 h-4 text-emerald-500/50" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-700">
                {summary.byStage.find(s => s.stage === 'distributed')?.count || 0}
              </div>
              <p className="text-xs font-medium text-emerald-700/70 mt-1">Successfully delivered</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4 flex flex-col h-full justify-center">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary/70" />
                Reserved Items
              </div>
              <div className="text-2xl font-bold text-foreground">{wowMetrics?.resourcesReserved ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4 flex flex-col h-full justify-center">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Leaf className="w-4 h-4 text-primary/70" />
                Waste Diverted
              </div>
              <div className="text-2xl font-bold text-foreground">{wowMetrics?.wasteDiverted ?? '—'}</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Bridging */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Bridging
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Bridging time and movement.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-primary/70" />
                Appointments Scheduled
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.appointmentsScheduled ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary/70" />
                Appointments Completed
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.appointmentsCompleted ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary/70" />
                No-Shows
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.noShows ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary/70" />
                Receive &rarr; Give (Hours)
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.receiveToGiveHours ?? '—'}</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Relationships */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Relationships
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Form relationships with dignity.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary/70" />
                Acknowledgments Pending
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.acknowledgmentsPending ?? '—'}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardContent className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                <Heart className="w-4 h-4 text-primary/70" />
                Gratitude Given / Acknowledgements Sent
              </div>
              <div className="text-3xl font-bold text-foreground">{wowMetrics?.acknowledgmentsSent ?? '—'}</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Universal Service */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Universal Service
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1">Universally Service</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm border-border overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
              <CardTitle className="text-lg">Service Loop Velocity</CardTitle>
              <CardDescription className="font-mono text-xs mt-2 text-primary/80">
                Receive &rarr; Recognize &rarr; Classify &rarr; Match &rarr; Schedule &rarr; Serve &rarr; Verify &rarr; Acknowledge &rarr; Learn
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-border/50">
                {[
                  ['Received Today', serviceMetrics?.receivedToday ?? '—'],
                  ['Received This Week', serviceMetrics?.receivedThisWeek ?? '—'],
                  ['Scheduled Today', serviceMetrics?.scheduledToday ?? '—'],
                  ['Overdue Actions', serviceMetrics?.overdue ?? '—'],
                  ['Pending Verification', serviceMetrics?.pendingVerification ?? '—'],
                  ['Reserved Items', serviceMetrics?.reservedItems ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="p-4 bg-card transition-colors hover:bg-muted/20">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
                    <p className="text-xl font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-lg">T.I.E.R. Breakdown</CardTitle>
              <CardDescription>Classification tiers for active service</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {summary.byTier.map((tier) => {
                  const tierColors: Record<string, string> = {
                    T: 'bg-[#C4700E]',
                    I: 'bg-[#3B5AA0]',
                    E: 'bg-[#1E7A4E]',
                    R: 'bg-[#A3442A]',
                  };
                  const tierNames: Record<string, string> = {
                    T: 'Tactical',
                    I: 'Immediate',
                    E: 'Essential',
                    R: 'Reserve',
                  };
                  return (
                    <div key={tier.tier} className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-muted font-bold text-foreground border border-border/50">
                        {tier.tier}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-muted-foreground">{tierNames[tier.tier]}</span>
                          <span className="text-foreground">{tier.count} items</span>
                        </div>
                        <div className="bg-secondary rounded-full h-2 overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full ${tierColors[tier.tier] ?? 'bg-primary'} transition-all duration-1000 ease-out`}
                            style={{ width: `${(tier.count / maxTierCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
