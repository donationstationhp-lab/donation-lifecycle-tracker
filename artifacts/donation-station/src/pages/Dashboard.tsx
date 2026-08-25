import { useGetDashboard } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';
import {
  AlertTriangle, ArrowRight, Package, TrendingUp, Clock, Heart, ExternalLink,
  ClipboardCheck, CalendarCheck, ShieldAlert,
} from 'lucide-react';
import { TierBadge, StageChip, ConditionChip } from '@/components/shared';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

const API_KEY = import.meta.env.VITE_DONATION_STATION_API_KEY ?? '';

function usePendingCount() {
  const { data } = useQuery<unknown[]>({
    queryKey: ['pending-count'],
    queryFn: () =>
      fetch('/api/items?pendingReview=true', {
        headers: { 'X-API-Key': API_KEY },
      }).then((r) => (r.ok ? r.json() : [])),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  return Array.isArray(data) ? data.length : 0;
}

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboard();
  const pendingCount = usePendingCount();

  // Build the public donate URL — same origin, /donation-station/donate
  const donateUrl = `${window.location.origin}/donation-station/donate`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        Failed to load dashboard. Please try again.
      </div>
    );
  }

  const maxTierCount = Math.max(...summary.byTier.map(t => t.count), 1);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-bold tracking-tight">Operations Overview</h1>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-sidebar-border/10 bg-gradient-to-br from-white to-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Total Active Items
              <Package className="w-4 h-4 text-primary/40" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.totalItems}</div>
            <p className="text-xs text-muted-foreground mt-1 tracking-tight">In system currently</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-sidebar-border/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
              Items Distributed
              <TrendingUp className="w-4 h-4 text-green-500/50" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">
              {summary.byStage.find(s => s.stage === 'distributed')?.count || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1 tracking-tight">Successfully delivered</p>
          </CardContent>
        </Card>

        <Card className={`shadow-sm transition-all hover-elevate cursor-pointer ${summary.expiringCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
          <Link href="/expiring" className="block">
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium flex justify-between items-center ${summary.expiringCount > 0 ? 'text-orange-800' : 'text-muted-foreground'}`}>
                Expiring Soon
                <AlertTriangle className={`w-4 h-4 ${summary.expiringCount > 0 ? 'text-orange-500 animate-pulse' : 'text-primary/40'}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${summary.expiringCount > 0 ? 'text-orange-600' : 'text-foreground'}`}>
                {summary.expiringCount}
              </div>
              <p className={`text-xs mt-1 tracking-tight ${summary.expiringCount > 0 ? 'text-orange-700' : 'text-muted-foreground'}`}>
                Within 14 days
              </p>
            </CardContent>
          </Link>
        </Card>

        {/* Pending Review card */}
        <Card className={`shadow-sm transition-all hover-elevate cursor-pointer ${pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-sidebar-border/10'}`}>
          <Link href="/pending" className="block">
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium flex justify-between items-center ${pendingCount > 0 ? 'text-amber-800' : 'text-muted-foreground'}`}>
                Pending Review
                <Clock className={`w-4 h-4 ${pendingCount > 0 ? 'text-amber-500 animate-pulse' : 'text-primary/40'}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                {pendingCount}
              </div>
              <p className={`text-xs mt-1 tracking-tight ${pendingCount > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                {pendingCount === 1 ? 'Donor submission' : 'Donor submissions'}
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/pickups" className="block">
          <Card className={`shadow-sm transition-all hover-elevate h-full ${summary.pickupsPendingVerification > 0 ? 'border-amber-200 bg-amber-50/60' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                Pickup Verification
                <ClipboardCheck className="w-4 h-4 text-primary/60" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.pickupsPendingVerification}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting verification</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/pickups" className="block">
          <Card className="shadow-sm transition-all hover-elevate h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                Confirmed This Week
                <CalendarCheck className="w-4 h-4 text-green-600/60" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">{summary.pickupsConfirmedThisWeek}</div>
              <p className="text-xs text-muted-foreground mt-1">Ready or in progress</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/pickup-flags" className="block">
          <Card className={`shadow-sm transition-all hover-elevate h-full ${summary.flaggedPickupValues > 0 ? 'border-red-200 bg-red-50/60' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                Pickup Flags
                <ShieldAlert className="w-4 h-4 text-red-600/60" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">{summary.flaggedPickupValues}</div>
              <p className="text-xs text-muted-foreground mt-1">Phone or address values</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Share Donate Link banner */}
      <div className="rounded-xl bg-gradient-to-r from-[#1E7A4E]/10 to-[#2C4B6E]/10 border border-[#1E7A4E]/20 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-[#1E7A4E]/10 rounded-full p-2 shrink-0">
            <Heart className="w-5 h-5 text-[#1E7A4E]" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Donor Intake Form</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share this link with donors so they can submit items directly — no login needed.
            </p>
            <p className="text-xs font-mono text-[#2C4B6E] mt-1 break-all">{donateUrl}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="border-[#1E7A4E]/30 text-[#1E7A4E] hover:bg-[#1E7A4E]/10 text-xs"
            onClick={() => navigator.clipboard?.writeText(donateUrl)}
          >
            Copy link
          </Button>
          <a href={donateUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-xs gap-1">
              Open <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        </div>
      </div>

      {/* Tier Breakdown */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">T.I.E.R. Breakdown</CardTitle>
          <CardDescription>Distribution of items by classification tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
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
                <div key={tier.tier} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-4">{tier.tier}</span>
                  <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tierColors[tier.tier] ?? 'bg-primary'} transition-all`}
                      style={{ width: `${(tier.count / maxTierCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">{tier.count}</span>
                  <span className="text-xs text-muted-foreground w-20 hidden sm:block">
                    {tierNames[tier.tier]}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Items */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Intakes</CardTitle>
            <CardDescription>Latest items logged into the system</CardDescription>
          </div>
          <Link href="/items">
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/50 -mx-6 px-6">
            {summary.recentItems.map((item) => (
              <Link key={item.id} href={`/items/${item.id}`} className="block py-4 hover:bg-secondary/50 transition-colors -mx-2 px-2 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TierBadge tier={item.tier} />
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {item.name}
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {item.itemId}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-2 items-center">
                        <span>{item.category}</span>
                        <span>•</span>
                        <span>{format(new Date(item.createdAt), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StageChip stage={item.stage} />
                    <ConditionChip condition={item.condition} />
                  </div>
                </div>
              </Link>
            ))}
            {summary.recentItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No recent items found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
