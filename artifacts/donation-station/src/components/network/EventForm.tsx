import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { NetworkEventInput, NetworkGoods, NetworkSnapshot } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetworkCommand } from '@/hooks/use-network';
import { Field, NativeSelect } from './bits';

export type EventPreset = { kind: 'internal_move' | 'supply_transfer'; agentId?: string; organizationId?: string };

type Line = { key: number; source: 'item' | 'text'; itemId: string; description: string; quantity: string; unit: string };
const newLine = (key: number): Line => ({ key, source: 'text', itemId: '', description: '', quantity: '1', unit: 'each' });

function Body({ snap, preset, onClose }: { snap: NetworkSnapshot; preset: EventPreset; onClose: () => void }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  // One stable id per form submission attempt; the dialog remounts after success so the next record gets a new one.
  const requestId = useRef(crypto.randomUUID()).current;
  const internal = preset.kind === 'internal_move';
  const [agentId, setAgentId] = useState(preset.agentId ?? '');
  const [toAgentId, setToAgentId] = useState('');
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [counterparty, setCounterparty] = useState<'org' | 'individual'>('org');
  const [organizationId, setOrganizationId] = useState(preset.organizationId ?? '');
  const [individualSource, setIndividualSource] = useState('');
  const [eventDate, setEventDate] = useState(snap.today);
  const [lines, setLines] = useState<Line[]>([newLine(1)]);
  const [containers, setContainers] = useState('0');
  const [pounds, setPounds] = useState('');
  const [mode, setMode] = useState<NetworkEventInput['recordingMode']>('live');
  const [actor, setActor] = useState<NetworkEventInput['actingEntity']>('Donation Station');
  const [err, setErr] = useState<string | null>(null);
  const nextKey = useRef(2);

  const upd = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    if (!agentId) { setErr('Choose the site this record is from.'); return; }
    if (internal && (!toAgentId || toAgentId === agentId)) { setErr('Choose a different destination site.'); return; }
    if (!internal) {
      if (counterparty === 'org' && !organizationId) { setErr('Choose a partner organization.'); return; }
      if (counterparty === 'individual' && !individualSource.trim()) { setErr('Enter the individual source first name.'); return; }
      if (counterparty === 'individual' && direction !== 'incoming') { setErr('An individual source can only be incoming.'); return; }
    }
    const items: NetworkGoods[] = [];
    for (const l of lines) {
      const q = Number(l.quantity);
      const inv = l.source === 'item' ? snap.items.find((i) => i.id === l.itemId) : undefined;
      const description = (l.source === 'item' ? inv?.name : l.description.trim()) ?? '';
      if (l.source === 'item' && !inv) { setErr('Choose an inventory item or switch the line to a description.'); return; }
      if (!description || !(q >= 0.001) || !l.unit.trim()) { setErr('Every goods line needs a description, a quantity above zero and a unit.'); return; }
      items.push({ ...(inv ? { itemId: inv.id } : {}), description, quantity: q, unit: l.unit.trim() });
    }
    const event: NetworkEventInput = {
      requestId, kind: preset.kind, agentId, eventDate, items,
      containerCount: Math.max(0, Number(containers) || 0),
      estimatedPounds: pounds.trim() === '' ? null : Number(pounds),
      recordingMode: mode, actingEntity: actor,
      ...(internal
        ? { toAgentId }
        : { direction, ...(counterparty === 'org' ? { organizationId } : { individualSource: individualSource.trim() }) }),
    };
    if (event.estimatedPounds != null && !(event.estimatedPounds >= 0)) { setErr('Pounds must be zero or more, or left blank.'); return; }
    cmd.mutate({ data: { action: 'recordEvent', event } }, {
      onSuccess: () => { toast({ title: internal ? 'Internal move recorded' : 'Supply transfer recorded', description: mode === 'scheduled' ? 'Recorded as scheduled, not confirmed complete.' : undefined }); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{internal ? 'Record internal move' : 'Record supply transfer'}</DialogTitle>
        <DialogDescription>This record does not change receipt provenance, claim or transfer state, or DS counters.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={internal ? 'From site' : 'Site'}>
          <NativeSelect data-testid="select-event-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Choose a site</option>
            {snap.agents.map((a) => <option key={a.id} value={a.id}>{a.shortName}</option>)}
          </NativeSelect>
        </Field>
        {internal ? (
          <Field label="To site">
            <NativeSelect data-testid="select-event-toagent" value={toAgentId} onChange={(e) => setToAgentId(e.target.value)}>
              <option value="">Choose a site</option>
              {snap.agents.filter((a) => a.id !== agentId).map((a) => <option key={a.id} value={a.id}>{a.shortName}</option>)}
            </NativeSelect>
          </Field>
        ) : (
          <>
            <Field label="Direction">
              <NativeSelect data-testid="select-event-direction" value={direction} onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming')}>
                <option value="outgoing">Outgoing (site to partner)</option>
                <option value="incoming">Incoming (to site)</option>
              </NativeSelect>
            </Field>
            <Field label="Counterparty" className="sm:col-span-2">
              <NativeSelect data-testid="select-event-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value as 'org' | 'individual')}>
                <option value="org">Partner organization</option>
                <option value="individual">Individual source (incoming, first name only)</option>
              </NativeSelect>
            </Field>
            {counterparty === 'org' ? (
              <Field label="Partner organization" className="sm:col-span-2">
                <NativeSelect data-testid="select-event-org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                  <option value="">Choose an organization</option>
                  {snap.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Individual first name only" hint="No last names or contact details." className="sm:col-span-2">
                <Input data-testid="input-event-individual" maxLength={60} value={individualSource} onChange={(e) => setIndividualSource(e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Field label="Date"><Input type="date" data-testid="input-event-date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></Field>
        <Field label="Recording mode">
          <NativeSelect data-testid="select-event-mode" value={mode} onChange={(e) => setMode(e.target.value as NetworkEventInput['recordingMode'])}>
            <option value="live">Live</option><option value="after transfer">After transfer</option><option value="scheduled">Scheduled (not yet done)</option>
          </NativeSelect>
        </Field>
        <Field label="Acting entity">
          <NativeSelect data-testid="select-event-actor" value={actor} onChange={(e) => setActor(e.target.value as NetworkEventInput['actingEntity'])}>
            <option value="Donation Station">Donation Station</option><option value="Communities in Action">Communities in Action</option>
          </NativeSelect>
        </Field>
        <Field label="Containers"><Input type="number" min={0} data-testid="input-event-containers" value={containers} onChange={(e) => setContainers(e.target.value)} /></Field>
        <Field label="Estimated pounds" hint="Leave blank if unknown. Blank is stored as unknown, not zero.">
          <Input type="number" min={0} step="any" data-testid="input-event-pounds" value={pounds} onChange={(e) => setPounds(e.target.value)} placeholder="Unknown" />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goods lines</span>
          <Button type="button" size="sm" variant="outline" data-testid="button-add-line" disabled={lines.length >= 100}
            onClick={() => setLines((ls) => [...ls, newLine(nextKey.current++)])}><Plus className="w-3.5 h-3.5 mr-1" />Add line</Button>
        </div>
        {lines.map((l, idx) => (
          <div key={l.key} className="rounded-md border p-2 grid gap-2 sm:grid-cols-[9rem_1fr_5rem_6rem_auto] items-center" data-testid={`row-line-${idx}`}>
            <NativeSelect data-testid={`select-line-source-${idx}`} value={l.source} onChange={(e) => upd(l.key, { source: e.target.value as Line['source'], itemId: '' })}>
              <option value="text">Described goods</option><option value="item">Inventory item</option>
            </NativeSelect>
            {l.source === 'item' ? (
              <NativeSelect data-testid={`select-line-item-${idx}`} value={l.itemId} onChange={(e) => upd(l.key, { itemId: e.target.value })}>
                <option value="">Choose an item</option>
                {snap.items.map((i) => <option key={i.id} value={i.id}>{i.itemId} - {i.name}</option>)}
              </NativeSelect>
            ) : (
              <Input placeholder="Description" maxLength={300} data-testid={`input-line-desc-${idx}`} value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} />
            )}
            <Input type="number" min={0.001} step="any" aria-label="Quantity" data-testid={`input-line-qty-${idx}`} value={l.quantity} onChange={(e) => upd(l.key, { quantity: e.target.value })} />
            <Input placeholder="Unit" maxLength={50} aria-label="Unit" data-testid={`input-line-unit-${idx}`} value={l.unit} onChange={(e) => upd(l.key, { unit: e.target.value })} />
            <Button type="button" size="icon" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} data-testid={`button-remove-line-${idx}`}
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
      {err && <p className="text-sm text-destructive" data-testid="text-event-error">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button data-testid="button-save-event" onClick={submit} disabled={cmd.isPending}>{cmd.isPending ? 'Saving...' : 'Record'}</Button>
      </DialogFooter>
    </>
  );
}

export function EventFormDialog({ snap, preset, onClose }: { snap: NetworkSnapshot; preset: EventPreset | null; onClose: () => void }) {
  return (
    <Dialog open={!!preset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        {preset && <Body snap={snap} preset={preset} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
