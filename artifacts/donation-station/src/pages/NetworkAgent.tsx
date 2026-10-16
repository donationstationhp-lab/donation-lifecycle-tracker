import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNetwork } from '@/hooks/use-network';
import { Empty, NetworkError, NetworkLoading, Section } from '@/components/network/bits';
import { AgentFormDialog } from '@/components/network/AgentForm';
import { DayFormDialog, type DayPreset } from '@/components/network/DayForm';
import { EventFormDialog, type EventPreset } from '@/components/network/EventForm';
import { EventList } from '@/components/network/EventList';

export default function NetworkAgent() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useNetwork();
  const [edit, setEdit] = useState(false);
  const [day, setDay] = useState<DayPreset | null>(null);
  const [ev, setEv] = useState<EventPreset | null>(null);

  if (isLoading) return <NetworkLoading />;
  if (isError || !data) return <NetworkError onRetry={() => refetch()} />;
  const agent = data.agents.find((a) => a.id === id);
  if (!agent) {
    return (
      <div className="space-y-4">
        <Link href="/network" className="text-sm text-primary underline">Back to network</Link>
        <Empty title="Site not found" body="It may have been removed or the link is out of date." />
      </div>
    );
  }
  const days = data.days.filter((d) => d.agentId === id).sort((a, b) => b.day.localeCompare(a.day));
  const missing = data.missingDays.filter((m) => m.agentId === id).sort((a, b) => b.day.localeCompare(a.day));
  const firsts = days.map((d) => d.firstDs).filter((x): x is string => !!x).sort();
  const lasts = days.map((d) => d.lastDs).filter((x): x is string => !!x).sort();
  const items = data.items.filter((i) => i.receivingAgentId === id);
  const moves = data.events.filter((e) => e.kind === 'internal_move' && (e.fromAgentId === id || e.toAgentId === id));
  const supply = data.events.filter((e) => e.kind === 'supply_transfer' && (e.fromAgentId === id || e.toAgentId === id));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-3">
        <Link href="/network" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" />Network</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-agent-name">{agent.fullName}</h1>
            <p className="text-sm text-muted-foreground">{agent.address}</p>
          </div>
          <Button variant="outline" data-testid="button-edit-agent" onClick={() => setEdit(true)}><Pencil className="w-4 h-4 mr-2" />Edit</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{agent.status}</Badge><Badge variant="outline">{agent.type}</Badge>
          <Badge variant="outline">Site #{agent.number}</Badge>
          {agent.sku ? <Badge variant="outline">SKU {agent.sku}</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">Owner {agent.owner} / operator {agent.operator} / joined {agent.joinedOn}</p>
        {agent.notes && <p className="text-sm whitespace-pre-wrap">{agent.notes}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['First DS', firsts[0] ?? 'None yet', 'text-first-ds'],
          ['Last DS', lasts[lasts.length - 1] ?? 'None yet', 'text-last-ds'],
          ['Items received', String(items.length), 'text-items-count'],
          ['Missing days', String(missing.length), 'text-missing-count'],
        ].map(([l, v, t]) => (
          <div key={l} className="rounded-lg border bg-card p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className="text-lg font-bold font-mono" data-testid={t}>{v}</p>
          </div>
        ))}
      </div>

      <Section title="Received items" testId="section-received-items">
        {items.length === 0 ? <Empty title="No items received here yet" /> : (
          <ul className="divide-y rounded-lg border bg-card">
            {items.map((i) => (
              <li key={i.id} className="p-3 text-sm flex gap-3" data-testid={`row-item-${i.id}`}>
                <Link href={`/items/${i.id}`} className="text-primary underline font-mono">{i.itemId}</Link>
                <span>{i.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Day log" testId="section-day-log" action={<Button size="sm" data-testid="button-log-day" onClick={() => setDay({ agentId: id })}>Log day</Button>}>
        {missing.length > 0 && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm space-y-2" data-testid="list-agent-missing">
            <p className="font-semibold text-amber-900">Missing dates</p>
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <Button key={m.day} size="sm" variant="outline" data-testid={`button-missing-${m.day}`} onClick={() => setDay({ agentId: id, day: m.day })}>{m.day}</Button>
              ))}
            </div>
          </div>
        )}
        {days.length === 0 ? <Empty title="No days logged" /> : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">State</th><th className="p-2">Items</th><th className="p-2">First DS</th><th className="p-2">Last DS</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id} className="border-t" data-testid={`row-day-${d.day}`}>
                    <td className="p-2">{d.day}</td><td className="p-2">{d.state}</td><td className="p-2">{d.itemCount}</td>
                    <td className="p-2 font-mono">{d.firstDs ?? '-'}</td><td className="p-2 font-mono">{d.lastDs ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Internal moves in and out" testId="section-moves" action={<Button size="sm" data-testid="button-record-move" onClick={() => setEv({ kind: 'internal_move', agentId: id })}>Record move</Button>}>
        <EventList snap={data} events={moves} perspective={id} empty="No internal moves recorded" />
      </Section>

      <Section title="Supply transfers" testId="section-supply" action={<Button size="sm" data-testid="button-record-supply" onClick={() => setEv({ kind: 'supply_transfer', agentId: id })}>Record supply transfer</Button>}>
        <EventList snap={data} events={supply} allowAck empty="No supply transfers recorded" />
      </Section>

      <AgentFormDialog open={edit} agent={agent} onClose={() => setEdit(false)} />
      <DayFormDialog snap={data} preset={day} onClose={() => setDay(null)} />
      <EventFormDialog snap={data} preset={ev} onClose={() => setEv(null)} />
    </div>
  );
}
