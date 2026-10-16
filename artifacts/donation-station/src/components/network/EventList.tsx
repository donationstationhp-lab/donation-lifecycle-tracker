import { useState } from 'react';
import type { NetworkEvent, NetworkSnapshot } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetworkCommand } from '@/hooks/use-network';
import { Empty, Field, NativeSelect, agentName, fmtPounds, partnerName } from './bits';

function AckBody({ ev, onClose }: { ev: NetworkEvent; onClose: () => void }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const [ack, setAck] = useState(ev.acknowledgment || 'pending');
  const [note, setNote] = useState(ev.acknowledgmentNote ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = () =>
    cmd.mutate(
      { data: { action: 'acknowledge', id: ev.id, acknowledgment: { acknowledgment: ack as 'pending', note } } },
      { onSuccess: () => { toast({ title: 'Acknowledgment saved' }); onClose(); }, onError: (e) => setErr(errMsg(e)) },
    );
  return (
    <>
      <DialogHeader>
        <DialogTitle>Acknowledgment</DialogTitle>
        <DialogDescription>Record whether the partner confirmed this transfer. This does not alter inventory or claims.</DialogDescription>
      </DialogHeader>
      <Field label="Status">
        <NativeSelect data-testid="select-ack-status" value={ack} onChange={(e) => setAck(e.target.value)}>
          <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="confirmed with differences">Confirmed with differences</option>
        </NativeSelect>
      </Field>
      <Field label="Note"><Textarea data-testid="input-ack-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button data-testid="button-save-ack" onClick={save} disabled={cmd.isPending}>{cmd.isPending ? 'Saving...' : 'Save'}</Button>
      </DialogFooter>
    </>
  );
}

export function EventList({ snap, events, perspective, allowAck, empty }: {
  snap: NetworkSnapshot; events: NetworkEvent[]; perspective?: string; allowAck?: boolean; empty: string;
}) {
  const [acking, setAcking] = useState<NetworkEvent | null>(null);
  if (events.length === 0) return <Empty title={empty} />;
  const sorted = [...events].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  return (
    <>
      <ul className="divide-y rounded-lg border bg-card">
        {sorted.map((e) => {
          const scheduled = e.recordingMode === 'scheduled';
          const internal = e.kind === 'internal_move';
          const who = internal
            ? `${agentName(snap, e.fromAgentId)} to ${agentName(snap, e.toAgentId)}`
            : `${e.direction === 'incoming' ? 'Incoming to' : 'Outgoing from'} ${agentName(snap, e.fromAgentId ?? e.toAgentId)} ${e.organizationId ? (e.direction === 'incoming' ? 'from ' : 'to ') + partnerName(snap, e.organizationId) : e.individualSource ? `from ${e.individualSource}` : ''}`;
          const dir = perspective && internal ? (e.toAgentId === perspective ? (scheduled ? 'Planned in' : 'In') : (scheduled ? 'Planned out' : 'Out')) : null;
          return (
            <li key={e.id} className="p-3 space-y-1.5" data-testid={`row-event-${e.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{who}</span>
                {dir && <Badge variant="outline">{dir}</Badge>}
                <span className="text-muted-foreground">{e.eventDate}</span>
                {scheduled
                  ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid={`status-scheduled-${e.id}`}>Scheduled - not confirmed complete</Badge>
                  : <Badge variant="secondary">{e.recordingMode}</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">{e.actingEntity}</span>
              </div>
              <ul className="text-sm text-muted-foreground list-disc pl-5">
                {e.items.map((g, i) => <li key={i}>{g.quantity} {g.unit} {g.description}</li>)}
              </ul>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{e.containerCount} containers{scheduled ? ' (planned)' : ''}</span>
                <span data-testid={`text-pounds-${e.id}`}>{fmtPounds(e.estimatedPounds)}</span>
                {!internal && (
                  <span data-testid={`text-ack-${e.id}`}>Acknowledgment: <b className="text-foreground">{e.acknowledgment || 'pending'}</b>{e.acknowledgmentNote ? ` - ${e.acknowledgmentNote}` : ''}</span>
                )}
                {allowAck && !internal && (
                  <Button size="sm" variant="outline" className="h-7" data-testid={`button-ack-${e.id}`} onClick={() => setAcking(e)}>Update acknowledgment</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!acking} onOpenChange={(o) => !o && setAcking(null)}>
        <DialogContent className="max-w-md">{acking && <AckBody key={acking.id} ev={acking} onClose={() => setAcking(null)} />}</DialogContent>
      </Dialog>
    </>
  );
}
