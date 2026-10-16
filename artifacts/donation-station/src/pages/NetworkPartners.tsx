import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import type { NetworkPartner } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNetwork } from '@/hooks/use-network';
import { Empty, NetworkError, NetworkLoading } from '@/components/network/bits';
import { PartnerFormDialog, NEW_PARTNER, type NewPartner } from '@/components/network/PartnerForm';

export default function NetworkPartners() {
  const { data, isLoading, isError, refetch } = useNetwork();
  const [editing, setEditing] = useState<NetworkPartner | NewPartner | null>(null);
  if (isLoading) return <NetworkLoading />;
  if (isError || !data) return <NetworkError onRetry={() => refetch()} />;
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Link href="/network" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" />Network</Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-partners-title">Community partners</h1>
          <Button data-testid="button-add-partner" onClick={() => setEditing(NEW_PARTNER)}>Add partner</Button>
        </div>
        <p className="text-sm text-muted-foreground">Each partner is an existing organization recipient account. New organizations are added under <Link href="/accounts" className="underline text-primary">Accounts</Link>, then given a profile here.</p>
      </div>
      {data.partners.length === 0 ? (
        <Empty title="No organization accounts yet" body="Create an organization recipient account, and it will appear here as a node needing a profile." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.partners.map((p) => {
            const needed = p.profile?.nodeStatus === 'profile needed';
            return (
              <div key={p.id} className="rounded-lg border bg-card p-4 space-y-2" data-testid={`card-partner-${p.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/network/partners/${p.id}`} className="font-semibold hover:underline" data-testid={`link-partner-${p.id}`}>{p.name}</Link>
                  <Badge variant={needed ? 'destructive' : p.profile.nodeStatus === 'active' ? 'default' : 'secondary'}>{p.profile?.nodeStatus ?? 'profile needed'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{needed ? 'No profile yet.' : `${p.profile.organizationType}${p.profile.area ? ` / ${p.profile.area}` : ''}`}</p>
                <Button size="sm" variant={needed ? 'default' : 'outline'} data-testid={`button-edit-partner-${p.id}`} onClick={() => setEditing(p)}>{needed ? 'Create profile' : 'Edit profile'}</Button>
              </div>
            );
          })}
        </div>
      )}
      <PartnerFormDialog partner={editing} today={data.today} onClose={() => setEditing(null)} />
    </div>
  );
}
