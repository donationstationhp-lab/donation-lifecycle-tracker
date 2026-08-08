import { useGetDashboard } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, Package, TrendingUp } from 'lucide-react';
import { TierBadge, StageChip, ConditionChip } from '@/components/shared';
import { format } from 'date-fns';
import { Button } from 'react-day-picker';

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboard();

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

  // Calculate percentages for Tier breakdown
  const maxTierCount = Math.max(...summary.byTier.map(t => t.count), 1);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-bold tracking-tight">Operations Overview</h1>
      
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <p className={`text-xs mt-1 tracking-tight flex items-center gap-1 ${summary.expiringCount > 0 ? 'text-orange-700' : 'text-muted-foreground'}`}>
                Needs attention <ArrowRight className="w-3 h-3" />
              </p>
            </CardContent>
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier Breakdown */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">T.I.E.R. Breakdown</CardTitle>
            <CardDescription>Composition of current inventory by class</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.byTier.map(tier => {
              const tierColors: Record<string, string> = {
                T: 'bg-tier-t text-tier-t',
                I: 'bg-tier-i text-tier-i',
                E: 'bg-tier-e text-tier-e',
                R: 'bg-tier-r text-tier-r',
              };
              const bg = tierColors[tier.tier].split(' ')[0];
              const text = tierColors[tier.tier].split(' ')[1];
              
              const percentage = Math.round((tier.count / maxTierCount) * 100) || 0;
              
              return (
                <div key={tier.tier} className="flex items-center gap-4">
                  <div className="w-16">
                    <TierBadge tier={tier.tier} />
                  </div>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${bg} rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className={`w-12 text-right font-mono font-medium text-sm ${text}`}>
                    {tier.count}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Pipeline */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Status</CardTitle>
            <CardDescription>Items across operational stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              {['intake', 'qc', 'storage', 'distributed'].map((stageName, index) => {
                const count = summary.byStage.find(s => s.stage === stageName)?.count || 0;
                return (
                  <div key={stageName} className="flex items-center group">
                    <div className="w-8 flex flex-col items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-mono text-xs font-bold z-10 ring-4 ring-card">
                        {index + 1}
                      </div>
                      {index < 3 && <div className="w-0.5 h-full bg-border -mb-8 mt-1 z-0" />}
                    </div>
                    <div className="ml-4 flex-1 flex justify-between items-center p-3 rounded-lg border border-transparent group-hover:border-border group-hover:bg-secondary/50 transition-colors">
                      <StageChip stage={stageName as any} />
                      <span className="font-mono text-lg font-semibold">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Items */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Intakes</CardTitle>
            <CardDescription>Latest items logged into the system</CardDescription>
          </div>
          <Link href="/items">
            <Button variant="outline" size="sm">View All</Button>
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