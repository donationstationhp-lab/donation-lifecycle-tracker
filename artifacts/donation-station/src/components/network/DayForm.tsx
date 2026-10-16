import { useState } from 'react';
import type { NetworkDayInput, NetworkSnapshot } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetworkCommand } from '@/hooks/use-network';
import { Field, NativeSelect } from './bits';

export type DayPreset = { agentId?: string; day?: string };

function Body({ snap, preset, onClose }: { snap: NetworkSnapshot; preset: DayPreset; onClose: () => void }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const [agentId, setAgentId] = useState(preset.agentId ?? '');
  const [day, setDay] = useState(preset.day ?? snap.today);
  const [state, setState] = useState<NetworkDayInput['state']>('Intake');
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (!agentId || !day) { setErr('Choose a site and a date.'); return; }
    cmd.mutate({ data: { action: 'logDay', day: { agentId, day, state } } }, {
      onSuccess: () => { toast({ title: 'Day logged' }); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Log a day</DialogTitle>
        <DialogDescription>First and last DS numbers and item counts are derived from received items, not typed in.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="Site">
          <NativeSelect data-testid="select-day-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Choose a site</option>
            {snap.agents.map((a) => <option key={a.id} value={a.id}>{a.shortName}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Date"><Input type="date" data-testid="input-day-date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="State">
          <NativeSelect data-testid="select-day-state" value={state} onChange={(e) => setState(e.target.value as NetworkDayInput['state'])}>
            <option value="Intake">Intake</option><option value="Idle">Idle</option><option value="Closed">Closed</option>
          </NativeSelect>
        </Field>
      </div>
      {err && <p className="text-sm text-destructive" data-testid="text-day-error">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button data-testid="button-save-day" onClick={submit} disabled={cmd.isPending}>{cmd.isPending ? 'Saving...' : 'Log day'}</Button>
      </DialogFooter>
    </>
  );
}

export function DayFormDialog({ snap, preset, onClose }: { snap: NetworkSnapshot; preset: DayPreset | null; onClose: () => void }) {
  return (
    <Dialog open={!!preset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {preset && <Body key={`${preset.agentId}-${preset.day}`} snap={snap} preset={preset} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
