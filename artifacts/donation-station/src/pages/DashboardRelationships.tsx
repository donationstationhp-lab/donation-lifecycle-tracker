import { useGetDashboard } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Users, Clock, CheckCircle2 } from 'lucide-react';
import { MetricCard, ActionCard, PageHeader } from '@/components/dashboard/shared';

export default function DashboardRelationships() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (isError || !summary) return <div>Error loading data.</div>;

  const wowMetrics = summary.serviceMetrics.wowMetrics;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Relationship Management"
        description="Detailed view for donor, account, and volunteer connections. Form relationships with dignity."
        icon={Heart}
        refreshedAt={summary.refreshedAt}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Acknowledgments Pending"
          value={wowMetrics?.acknowledgmentsPending ?? '—'}
          icon={Clock}
        />
        <MetricCard
          title="Acknowledgments Sent"
          value={wowMetrics?.acknowledgmentsSent ?? '—'}
          icon={CheckCircle2}
        />
        <MetricCard
          title="No-Shows"
          value={wowMetrics?.noShows ?? '—'}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          title="Donors"
          description="Manage donor relationships and history."
          href="/donors"
          icon={Heart}
          primary
        />
        <ActionCard
          title="Accounts"
          description="Manage recipient organizations and volunteer accounts."
          href="/accounts"
          icon={Users}
        />
      </div>
    </div>
  );
}