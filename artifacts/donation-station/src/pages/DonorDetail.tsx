import { useRoute, Link } from 'wouter';
import { useGetDonor, getGetDonorQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Package, Phone, Building2, StickyNote } from 'lucide-react';
import { DonorStageChip, TierBadge, StageChip } from '@/components/shared';
import { format } from 'date-fns';

export default function DonorDetail() {
  const [, params] = useRoute('/donors/:id');
  const id = params?.id || '';

  const { data: donor, isLoading, isError } = useGetDonor(id, {
    query: { enabled: !!id, queryKey: getGetDonorQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !donor) {
    return (
      <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">Donor Not Found</h2>
        <p className="mb-6">The donor you are looking for does not exist or an error occurred.</p>
        <Link href="/donors">
          <Button variant="outline">Return to Donors</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/donors">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{donor.name}</h1>
            <DonorStageChip stage={donor.stage} />
          </div>
          <p className="text-muted-foreground mt-1">
            {donor.giftCount} {donor.giftCount === 1 ? 'gift' : 'gifts'} • Donor since {format(new Date(donor.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Gift History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {donor.items.map((item) => (
                  <Link key={item.id} href={`/items/${item.id}`} className="block px-6 py-4 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center justify-between gap-4">
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
                          <span>{format(new Date(item.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <TierBadge tier={item.tier} />
                        <StageChip stage={item.stage} />
                      </div>
                    </div>
                  </Link>
                ))}
                {donor.items.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No gifts logged for this donor yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Phone className="w-3.5 h-3.5" /> Contact</span>
                <p className="font-medium">{donor.contact || 'Not on file'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Building2 className="w-3.5 h-3.5" /> Organization</span>
                <p className="font-medium">{donor.organization || 'Individual donor'}</p>
              </div>
              {donor.notes && (
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><StickyNote className="w-3.5 h-3.5" /> Notes</span>
                  <p className="text-sm text-foreground/80">{donor.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
