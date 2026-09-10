import { useGetDashboard } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarCheck, Truck, Zap, AlertTriangle, CalendarDays } from 'lucide-react';
import { MetricCard, ActionCard, PageHeader } from '@/components/dashboard/shared';

export default function DashboardBridging() {
  const { data: summary, isLoading, isError } = useGetDashboard();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (isError || !summary) return <div>Error loading data.</div>;

  const wowMetrics = summary.serviceMetrics.wowMetrics;
  const serviceMetrics = summary.serviceMetrics;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Bridging Logistics"
        description="Detailed view for appointments, calendar, and routes. Bridging time and movement."
        icon={Truck}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Scheduled Today"
          value={serviceMetrics?.scheduledToday ?? '—'}
          icon={CalendarDays}
        />
        <MetricCard
          title="Overdue"
          value={serviceMetrics?.overdue ?? '—'}
          icon={AlertTriangle}
          className={serviceMetrics && serviceMetrics.overdue > 0 ? "border-red-200 bg-red-50" : ""}
          valueClassName={serviceMetrics && serviceMetrics.overdue > 0 ? "text-red-600" : ""}
        />
        <MetricCard
          title="Appts Completed"
          value={wowMetrics?.appointmentsCompleted ?? '—'}
          icon={CalendarCheck}
        />
        <MetricCard
          title="Receive to Give"
          value={wowMetrics?.receiveToGiveHours ? `${wowMetrics.receiveToGiveHours}h` : '—'}
          icon={Zap}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          title="Routes Management"
          description="Organize pickup and delivery routes."
          href="/routes"
          icon={Truck}
          primary
        />
        <ActionCard
          title="Calendar"
          description="View all scheduled bridging events."
          href="/calendar"
          icon={CalendarDays}
        />
      </div>
    </div>
  );
}