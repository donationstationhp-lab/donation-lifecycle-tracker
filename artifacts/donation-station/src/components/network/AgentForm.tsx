import { useState } from 'react';
import type { NetworkAgent, NetworkAgentInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetworkCommand } from '@/hooks/use-network';
import { Field, NativeSelect } from './bits';

function Body({ agent, onClose }: { agent?: NetworkAgent; onClose: () => void }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const [f, setF] = useState({
    fullName: agent?.fullName ?? '', shortName: agent?.shortName ?? '', address: agent?.address ?? '',
    type: (agent?.type ?? 'CIA-provided') as NetworkAgentInput['type'],
    status: (agent?.status ?? 'active') as NetworkAgentInput['status'],
    sku: agent?.sku ?? '', notes: agent?.notes ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.fullName.trim() || !f.shortName.trim() || !f.address.trim()) { setErr('Full name, short name and address are required.'); return; }
    const payload: NetworkAgentInput = { ...f, fullName: f.fullName.trim(), shortName: f.shortName.trim(), address: f.address.trim(), sku: f.sku.trim() || null };
    cmd.mutate(
      { data: agent ? { action: 'updateAgent', id: agent.id, agent: payload } : { action: 'createAgent', agent: payload } },
      { onSuccess: () => { toast({ title: agent ? 'Site updated' : 'Site added' }); onClose(); }, onError: (e) => setErr(errMsg(e)) },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{agent ? `Edit ${agent.shortName}` : 'Add site'}</DialogTitle>
        <DialogDescription>Owner is Communities in Action and operator is Donation Station for every site. The site number is assigned by the server.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input data-testid="input-agent-fullname" value={f.fullName} maxLength={200} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label="Short name"><Input data-testid="input-agent-shortname" value={f.shortName} maxLength={100} onChange={(e) => set('shortName', e.target.value)} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input data-testid="input-agent-address" value={f.address} maxLength={300} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Type">
          <NativeSelect data-testid="select-agent-type" value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="CIA-provided">CIA-provided</option>
            <option value="host-permitted">Host-permitted</option>
          </NativeSelect>
        </Field>
        <Field label="Status">
          <NativeSelect data-testid="select-agent-status" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="seasonal">Seasonal</option>
            <option value="planned">Planned</option>
          </NativeSelect>
        </Field>
        <Field label="SKU" hint="Optional. Leave blank if none."><Input data-testid="input-agent-sku" value={f.sku} maxLength={100} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Owner / operator"><p className="text-sm py-2">Communities in Action / Donation Station</p></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea data-testid="input-agent-notes" value={f.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      {err && <p className="text-sm text-destructive" data-testid="text-agent-error">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button data-testid="button-save-agent" onClick={submit} disabled={cmd.isPending}>{cmd.isPending ? 'Saving...' : 'Save site'}</Button>
      </DialogFooter>
    </>
  );
}

export function AgentFormDialog({ open, agent, onClose }: { open: boolean; agent?: NetworkAgent; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">{open && <Body agent={agent} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}
