import { useGetDashboard } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Plus, ClipboardCheck, AlertTriangle, Flag, Box } from 'lucide-react';
import { MetricCard, ActionCard, PageHeader } from '@/components/dashboard/shared';
import { Link } from 'wouter';
import { TierBadge, StageChip, ConditionChip } from '@/components/shared';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DashboardReceiving() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (isError || !summary) return <div>Error loading data.</div>;

  const serviceMetrics = summary.serviceMetrics;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Receiving Operations"
        description="Detailed view for intake, review, and pickup operations. Receive what is."
        icon={Package}
        refreshedAt={summary.refreshedAt}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Active Items"
          value={summary.totalActiveItems}
          subtitle="In system currently"
          icon={Package}
        />
        <MetricCard
          title="Received Today"
          value={serviceMetrics?.receivedToday ?? '—'}
          icon={Box}
        />
        <MetricCard
          title="Received This Week"
          value={serviceMetrics?.receivedThisWeek ?? '—'}
          icon={Box}
        />
        <Link href="/expiring" className="block h-full">
          <MetricCard
            title="Expiring Soon"
            value={summary.expiringCount}
            subtitle="Within 14 days"
            icon={AlertTriangle}
            className={summary.expiringCount > 0 ? 'bg-orange-50 border-orange-200 hover:border-orange-300 transition-colors cursor-pointer' : 'hover:border-primary/30 transition-colors cursor-pointer'}
            valueClassName={summary.expiringCount > 0 ? 'text-orange-600' : 'text-foreground'}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard
          title="Intake Form"
          description="Process a new donation item into the system."
          href="/items/new"
          icon={Plus}
          primary
        />
        <ActionCard
          title="Items Directory"
          description="View and manage all received resources."
          href="/items"
          icon={Package}
        />
        <ActionCard
          title="Pickups"
          description="Manage donor pickup requests."
          href="/pickups"
          icon={ClipboardCheck}
        />
        <ActionCard
          title="Pickup Flags"
          description="Review flagged locations and phones."
          href="/pickup-flags"
          icon={Flag}
          badge={summary.flaggedPickupValues}
        />
      </div>

      {/* Recent Items List */}
      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
          <CardTitle className="text-lg">Recent Intakes</CardTitle>
          <Link href="/items">
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10">
              View All Directory
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {summary.recentItems.map((item) => (
              <Link key={item.id} href={`/items/${item.id}`} className="block p-4 hover:bg-muted/30 transition-colors group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TierBadge tier={item.tier} />
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                        {item.name}
                        <span className="text-[10px] font-mono text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded bg-secondary">{item.itemId}</span>
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
              <div className="text-center py-8 text-muted-foreground font-medium text-sm">
                No recent items found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}