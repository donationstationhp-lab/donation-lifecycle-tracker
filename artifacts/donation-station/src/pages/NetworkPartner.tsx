import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNetwork } from '@/hooks/use-network';
import { Empty, NetworkError, NetworkLoading, Section } from '@/components/network/bits';
import { PartnerFormDialog } from '@/components/network/PartnerForm';
import { EventFormDialog, type EventPreset } from '@/components/network/EventForm';
import { EventList } from '@/components/network/EventList';

export default function NetworkPartner() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useNetwork();
  const [edit, setEdit] = useState(false);
  const [ev, setEv] = useState<EventPreset | null>(null);
  if (isLoading) return <NetworkLoading />;
  if (isError || !data) return <NetworkError onRetry={() => refetch()} />;
  const p = data.partners.find((x) => x.id === id);
  if (!p) {
    return (
      <div className="space-y-4">
        <Link href="/network/partners" className="text-sm text-primary underline">Back to partners</Link>
        <Empty title="Partner not found" />
      </div>
    );
  }
  const pr = p.profile;
  const needed = pr?.nodeStatus === 'profile needed';
  const events = data.events.filter((e) => e.kind === 'supply_transfer' && e.organizationId === id);
  const rows: [string, string | undefined][] = needed || !pr ? [] : [
    ['Organization type', pr.organizationType], ['Area', pr.area], ['Contact channel', pr.contactChannel], ['Website', pr.website],
    ['Hours', pr.hours], ['Accepts', pr.accepts], ['Does not accept', pr.refuses], ['Capacity', pr.capacity],
    ['Urgent signal', pr.urgentSignal], ['Surplus signal', pr.surplusSignal], ['Idle signal', pr.idleSignal],
    ['Visibility', pr.visibility], ['Date joined', pr.dateJoined],
  ];
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-3">
        <Link href="/network/partners" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" />Partners</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-partner-name">{p.name}</h1>
            <Badge variant={needed ? 'destructive' : 'default'}>{pr?.nodeStatus ?? 'profile needed'}</Badge>
          </div>
          <Button variant="outline" data-testid="button-edit-partner" onClick={() => setEdit(true)}><Pencil className="w-4 h-4 mr-2" />{needed ? 'Create profile' : 'Edit profile'}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Organization-level information only. Personal contact details are not kept on partner profiles.</p>
      </div>

      <Section title="Profile" testId="section-partner-profile">
        {needed ? <Empty title="Profile needed" body="This organization account has no network profile yet." /> : (
          <dl className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-card p-4">
            {rows.map(([k, v]) => (
              <div key={k} data-testid={`field-${k.toLowerCase().replace(/\s+/g, '-')}`}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="text-sm whitespace-pre-wrap">{v || 'Not provided'}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title="Transfer history and acknowledgments" testId="section-partner-transfers" action={<Button size="sm" data-testid="button-record-supply" onClick={() => setEv({ kind: 'supply_transfer', organizationId: id })}>Record supply transfer</Button>}>
        <EventList snap={data} events={events} allowAck empty="No transfers with this partner yet" />
      </Section>

      <PartnerFormDialog partner={edit ? p : null} today={data.today} onClose={() => setEdit(false)} />
      <EventFormDialog snap={data} preset={ev} onClose={() => setEv(null)} />
    </div>
  );
}
