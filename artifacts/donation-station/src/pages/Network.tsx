import { useState } from 'react';
import { Link } from 'wouter';
import { Plus, Pencil, Handshake } from 'lucide-react';
import type { NetworkAgent, NetworkShelfInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetwork, useNetworkCommand } from '@/hooks/use-network';
import { Empty, NativeSelect, NetworkError, NetworkLoading, Section, agentName } from '@/components/network/bits';
import { AgentFormDialog } from '@/components/network/AgentForm';
import { DayFormDialog, type DayPreset } from '@/components/network/DayForm';

function ShelfRow({ id, code, zone, agents }: { id: string; code: string; zone: string; agents: NetworkAgent[] }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const [agentId, setAgentId] = useState('');
  const assign = () =>
    cmd.mutate({ data: { action: 'assignLocation', id, agentId } }, {
      onSuccess: () => toast({ title: `Shelf ${code} assigned` }),
      onError: (e) => toast({ title: 'Could not assign', description: errMsg(e), variant: 'destructive' }),
    });
  return (
    <li className="flex flex-wrap items-center gap-2 p-3" data-testid={`row-shelf-${id}`}>
      <span className="font-mono text-sm font-semibold">{code}</span>
      <span className="text-xs text-muted-foreground">{zone}</span>
      <div className="ml-auto flex items-center gap-2 w-full sm:w-auto">
        <NativeSelect className="sm:w-48" aria-label={`Site for ${code}`} data-testid={`select-shelf-agent-${id}`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Choose a site</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.shortName}</option>)}
        </NativeSelect>
        <Button size="sm" data-testid={`button-assign-shelf-${id}`} disabled={!agentId || cmd.isPending} onClick={assign}>Assign</Button>
      </div>
    </li>
  );
}

function ShelfCreate({ agents }: { agents: NetworkAgent[] }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const empty = { code: '', zone: '', agentId: '', description: '', capacity: '', tempZone: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.code.trim() || !f.zone.trim() || !f.agentId) { setErr('Code, zone and a site are required.'); return; }
    const location: NetworkShelfInput = {
      code: f.code.trim(), zone: f.zone.trim(), agentId: f.agentId,
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      capacity: f.capacity.trim() === '' ? null : Number(f.capacity),
      ...(f.tempZone ? { tempZone: f.tempZone as NetworkShelfInput['tempZone'] } : {}),
    };
    setErr(null);
    cmd.mutate({ data: { action: 'createLocation', location } }, {
      onSuccess: () => { toast({ title: `Shelf ${location.code} created` }); setF(empty); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <div className="rounded-lg border bg-card p-3 grid gap-2 sm:grid-cols-3" data-testid="form-create-shelf">
      <Input placeholder="Shelf code" data-testid="input-shelf-code" value={f.code} onChange={(e) => set('code', e.target.value)} />
      <Input placeholder="Zone" data-testid="input-shelf-zone" value={f.zone} onChange={(e) => set('zone', e.target.value)} />
      <NativeSelect aria-label="Site" data-testid="select-new-shelf-agent" value={f.agentId} onChange={(e) => set('agentId', e.target.value)}>
        <option value="">Choose a site (required)</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.shortName}</option>)}
      </NativeSelect>
      <Input placeholder="Description (optional)" data-testid="input-shelf-description" value={f.description} onChange={(e) => set('description', e.target.value)} />
      <Input type="number" min={0} placeholder="Capacity (optional)" data-testid="input-shelf-capacity" value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />
      <NativeSelect aria-label="Temperature zone" data-testid="select-shelf-temp" value={f.tempZone} onChange={(e) => set('tempZone', e.target.value)}>
        <option value="">Temperature zone (optional)</option>
        <option value="ambient">Ambient</option><option value="refrigerated">Refrigerated</option><option value="frozen">Frozen</option>
      </NativeSelect>
      {err && <p className="text-sm text-destructive sm:col-span-3" data-testid="text-shelf-error">{err}</p>}
      <div className="sm:col-span-3"><Button data-testid="button-create-shelf" onClick={submit} disabled={cmd.isPending}>{cmd.isPending ? 'Creating...' : 'Create shelf'}</Button></div>
    </div>
  );
}

export default function Network() {
  const { data, isLoading, isError, refetch } = useNetwork();
  const [agentDialog, setAgentDialog] = useState<{ agent?: NetworkAgent } | null>(null);
  const [day, setDay] = useState<DayPreset | null>(null);

  if (isLoading) return <NetworkLoading />;
  if (isError || !data) return <NetworkError onRetry={() => refetch()} />;
  const unassigned = data.locations.filter((l) => !l.agentId);
  const assignable = data.agents.filter((a) => a.status !== 'planned');
  const sortedMissing = [...data.missingDays].sort((a, b) => b.day.localeCompare(a.day));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-network-title">Site and partner network</h1>
          <p className="text-sm text-muted-foreground">Shared record of goods moving among our sites and community partners. Offers are not counted as received inventory.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/network/partners"><Button variant="outline" data-testid="link-partners"><Handshake className="w-4 h-4 mr-2" />Partners</Button></Link>
          <Button data-testid="button-add-agent" onClick={() => setAgentDialog({})}><Plus className="w-4 h-4 mr-2" />Add site</Button>
        </div>
      </div>

      <Section title={`Sites (${data.agents.length})`} testId="section-agents">
        {data.agents.length === 0 ? <Empty title="No sites yet" body="Add the first site to start recording days and receipts." /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.agents.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-4 space-y-2" data-testid={`card-agent-${a.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/network/agents/${a.id}`} className="font-semibold hover:underline" data-testid={`link-agent-${a.id}`}>
                    <span className="text-muted-foreground font-mono text-xs mr-2">#{a.number}</span>{a.shortName}
                  </Link>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${a.shortName}`} data-testid={`button-edit-agent-${a.id}`} onClick={() => setAgentDialog({ agent: a })}><Pencil className="w-4 h-4" /></Button>
                </div>
                <p className="text-sm text-muted-foreground">{a.address}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge>
                  <Badge variant="outline">{a.type}</Badge>
                  {a.sku ? <Badge variant="outline">SKU {a.sku}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">Owner {a.owner} / operator {a.operator} / joined {a.joinedOn}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Missing days (${sortedMissing.length})`} testId="section-missing-days">
        {sortedMissing.length === 0 ? <Empty title="No missing days" body="Every site has a logged state for each expected day." /> : (
          <ul className="divide-y rounded-lg border bg-card">
            {sortedMissing.map((m) => (
              <li key={`${m.agentId}-${m.day}`} className="flex items-center gap-3 p-3 text-sm" data-testid={`row-missing-${m.agentId}-${m.day}`}>
                <span className="font-medium">{agentName(data, m.agentId)}</span>
                <span className="text-muted-foreground">{m.day}</span>
                <Button size="sm" variant="outline" className="ml-auto" data-testid={`button-resolve-${m.agentId}-${m.day}`} onClick={() => setDay({ agentId: m.agentId, day: m.day })}>Log this day</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Unassigned shelves (${unassigned.length})`} testId="section-unassigned">
        {unassigned.length === 0 ? <Empty title="Every shelf belongs to a site" /> : (
          <ul className="divide-y rounded-lg border bg-card">
            {unassigned.map((l) => <ShelfRow key={l.id} id={l.id} code={l.code} zone={l.zone} agents={assignable} />)}
          </ul>
        )}
      </Section>

      <Section title="Add shelf" testId="section-create-shelf"><ShelfCreate agents={data.agents} /></Section>

      <AgentFormDialog open={!!agentDialog} agent={agentDialog?.agent} onClose={() => setAgentDialog(null)} />
      <DayFormDialog snap={data} preset={day} onClose={() => setDay(null)} />
    </div>
  );
}
