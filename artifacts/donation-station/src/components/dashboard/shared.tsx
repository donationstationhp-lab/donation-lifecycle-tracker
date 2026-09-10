import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';

export type WowMetrics = {
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

export type ServiceMetrics = {
  receivedToday: number;
  receivedThisWeek: number;
  scheduledToday: number;
  overdue: number;
  pendingVerification: number;
  reservedItems: number;
  wowMetrics: WowMetrics;
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className = "border-border bg-card",
  valueClassName = "text-foreground",
}: {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: any;
  trend?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={`shadow-sm flex flex-col h-full ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
          {title}
          {Icon && <Icon className="w-4 h-4 opacity-50" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        <div className={`text-3xl font-bold ${valueClassName}`}>{value}</div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {subtitle && <p className="text-xs font-medium text-muted-foreground leading-tight">{subtitle}</p>}
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ActionCard({
  title,
  description,
  href,
  icon: Icon,
  primary,
  badge
}: {
  title: string;
  description: string;
  href: string;
  icon: any;
  primary?: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} className="block h-full group">
      <Card className={`h-full shadow-sm transition-all hover-elevate ${primary ? 'bg-primary/5 border-primary/20' : 'bg-card border-border hover:border-primary/30'}`}>
        <CardContent className="p-5 flex items-start gap-4 h-full">
          <div className={`p-2.5 rounded-lg shrink-0 ${primary ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`font-semibold text-sm ${primary ? 'text-primary' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                {title}
              </h3>
              {badge !== undefined && badge > 0 && (
                <span className="min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold px-1.5 shadow-sm">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          </div>
          <div className="self-center shrink-0">
            <ArrowRight className={`w-4 h-4 ${primary ? 'text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'}`} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function PageHeader({ title, description, icon: Icon }: { title: string, description: string, icon: any }) {
  return (
    <div className="mb-8 border-b border-border/50 pb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
        <Icon className="w-6 h-6 text-primary" />
        {title}
      </h1>
      <p className="text-sm text-muted-foreground font-medium mt-1">{description}</p>
    </div>
  );
}