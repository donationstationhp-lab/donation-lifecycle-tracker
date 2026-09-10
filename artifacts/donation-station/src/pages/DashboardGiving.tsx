import { useGetDashboard } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Recycle, ArrowRightLeft, TrendingUp, Clock, Leaf } from 'lucide-react';
import { MetricCard, ActionCard, PageHeader } from '@/components/dashboard/shared';

export default function DashboardGiving() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (isError || !summary) return <div>Error loading data.</div>;

  const wowMetrics = summary.serviceMetrics.wowMetrics;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Giving Operations"
        description="Detailed view for transfer and distribution work. Give what completes."
        icon={Recycle}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Reserved Items"
          value={wowMetrics?.resourcesReserved ?? '—'}
          icon={Clock}
        />
        <MetricCard
          title="Items Distributed"
          value={summary.byStage.find(s => s.stage === 'distributed')?.count || 0}
          subtitle="Successfully delivered"
          icon={TrendingUp}
          className="border-emerald-500/20 bg-emerald-500/5"
          valueClassName="text-emerald-700"
        />
        <MetricCard
          title="Waste Diverted"
          value={wowMetrics?.wasteDiverted ?? '—'}
          icon={Leaf}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          title="Transfers Directory"
          description="Manage active transfers and distributions."
          href="/transfers"
          icon={ArrowRightLeft}
          primary
        />
      </div>
    </div>
  );
}