import { useGetDashboard } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, FileText, CheckCircle2, Clock } from 'lucide-react';
import { MetricCard, ActionCard, PageHeader } from '@/components/dashboard/shared';
import { Link } from 'wouter';

export default function DashboardGaining() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (isError || !summary) return <div>Error loading data.</div>;

  const wowMetrics = summary.serviceMetrics.wowMetrics;
  const pendingCount = summary.pendingReviewCount;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Gaining Operations"
        description="Detailed view for claim verification and matching. Gain what it means."
        icon={ShieldAlert}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/pending" className="block h-full">
          <MetricCard
            title="Due Diligence Review"
            value={pendingCount}
            subtitle="Submissions pending"
            icon={Clock}
            className={pendingCount > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-300 transition-colors cursor-pointer h-full' : 'hover:border-primary/30 transition-colors cursor-pointer h-full'}
            valueClassName={pendingCount > 0 ? 'text-amber-600' : 'text-foreground'}
          />
        </Link>
        <MetricCard
          title="Claims Verified"
          value={wowMetrics?.claimsVerified ?? '—'}
          subtitle="Due diligence completed"
          icon={CheckCircle2}
        />
        <MetricCard
          title="Resources Verified"
          value={wowMetrics?.resourcesVerified ?? '—'}
          subtitle="Successfully verified"
          icon={ShieldAlert}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          title="Review Submissions"
          description="Process items pending due diligence review."
          href="/pending"
          icon={Clock}
          primary
          badge={pendingCount}
        />
        <ActionCard
          title="Claims Directory"
          description="Manage all service requests and verification evidence."
          href="/claims"
          icon={FileText}
        />
      </div>
    </div>
  );
}