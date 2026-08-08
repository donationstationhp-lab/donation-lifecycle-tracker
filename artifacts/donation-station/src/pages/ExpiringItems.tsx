import { useListExpiringItems } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Clock, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { TierBadge, StageChip } from '@/components/shared';
import { format } from 'date-fns';

export default function ExpiringItems() {
  const { data, isLoading, isError } = useListExpiringItems();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        Failed to load expiring items. Please try again.
      </div>
    );
  }

  const totalExpiring = data.expired.length + data.critical.length + data.warning.length + data.watch.length;

  const sections = [
    {
      title: 'Expired',
      items: data.expired,
      icon: ShieldAlert,
      color: 'text-red-600',
      bgColor: 'bg-red-50 border-red-200',
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
      description: 'Items that have passed their expiration date and require disposal or re-evaluation.'
    },
    {
      title: 'Critical (≤ 3 Days)',
      items: data.critical,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 border-orange-200',
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
      description: 'Immediate action required. Distribute immediately.'
    },
    {
      title: 'Warning (≤ 7 Days)',
      items: data.warning,
      icon: AlertCircle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 border-amber-200',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      description: 'Prioritize for next available delivery routes.'
    },
    {
      title: 'Watch (≤ 14 Days)',
      items: data.watch,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-200',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Monitor these items and plan distribution within two weeks.'
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expiry Radar</h1>
        <p className="text-muted-foreground mt-1">
          {totalExpiring === 0 
            ? 'No items are currently nearing expiration.' 
            : `${totalExpiring} items require attention based on their expiration dates.`}
        </p>
      </div>

      {totalExpiring === 0 && (
        <div className="p-12 text-center bg-green-50 rounded-xl border border-green-200 flex flex-col items-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
          <h2 className="text-lg font-semibold text-green-800">All Clear</h2>
          <p className="text-green-600">Inventory is healthy. No items are expiring soon.</p>
        </div>
      )}

      {sections.map(section => {
        if (section.items.length === 0) return null;
        
        return (
          <section key={section.title} className="space-y-4">
            <div className="flex items-center gap-2">
              <section.icon className={`w-5 h-5 ${section.color}`} />
              <h2 className={`text-xl font-bold ${section.color}`}>{section.title}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${section.badgeColor}`}>
                {section.items.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{section.description}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.items.map(item => (
                <Link key={item.id} href={`/items/${item.id}`}>
                  <Card className={`h-full shadow-sm hover-elevate cursor-pointer border ${section.bgColor} transition-all`}>
                    <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-foreground line-clamp-2">{item.name}</h3>
                          <div className={`shrink-0 px-2 py-1 rounded text-xs font-bold text-center leading-tight ${section.badgeColor}`}>
                            {item.daysUntilExpiry < 0 
                              ? `${Math.abs(item.daysUntilExpiry)}d ago` 
                              : item.daysUntilExpiry === 0 
                                ? 'Today' 
                                : `${item.daysUntilExpiry}d left`}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs font-bold text-muted-foreground bg-white/50 px-1.5 py-0.5 rounded">
                            {item.itemId}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <TierBadge tier={item.tier} />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2 pt-3 border-t border-black/5">
                        <div className="text-xs font-medium opacity-80">
                          {item.expiryDate ? format(new Date(item.expiryDate), 'MMM d, yyyy') : ''}
                        </div>
                        <StageChip stage={item.stage} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}