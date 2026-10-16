import { useState } from 'react';
import type { NetworkPartner, NetworkPartnerProfile } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errMsg, useNetworkCommand } from '@/hooks/use-network';
import { Field, NativeSelect } from './bits';

type P = NetworkPartnerProfile;
export type NewPartner = { id?: undefined; name: string; profile?: undefined };
export const NEW_PARTNER: NewPartner = { name: '' };
const TEXT: { k: keyof P; label: string; long?: boolean; max: number }[] = [
  { k: 'organizationType', label: 'Organization type', max: 100 },
  { k: 'area', label: 'Area served', max: 200 },
  { k: 'contactChannel', label: 'Contact channel (organization level)', max: 300 },
  { k: 'website', label: 'Website', max: 500 },
  { k: 'hours', label: 'Hours', long: true, max: 1000 },
  { k: 'accepts', label: 'Accepts', long: true, max: 2000 },
  { k: 'refuses', label: 'Does not accept', long: true, max: 2000 },
  { k: 'capacity', label: 'Capacity', long: true, max: 1000 },
  { k: 'urgentSignal', label: 'Urgent signal', long: true, max: 1000 },
  { k: 'surplusSignal', label: 'Surplus signal', long: true, max: 1000 },
  { k: 'idleSignal', label: 'Idle signal', long: true, max: 1000 },
];

function Body({ partner, today, onClose }: { partner: NetworkPartner | NewPartner; today: string; onClose: () => void }) {
  const { toast } = useToast();
  const cmd = useNetworkCommand();
  const isNew = !partner.id;
  const needed = !isNew && partner.profile?.nodeStatus === 'profile needed';
  const base = partner.profile;
  const [name, setName] = useState(partner.name);
  const [p, setP] = useState<P>({
    organizationType: base?.organizationType ?? '', area: base?.area ?? '', contactChannel: base?.contactChannel ?? '',
    website: base?.website ?? '', hours: base?.hours ?? '', accepts: base?.accepts ?? '', refuses: base?.refuses ?? '',
    capacity: base?.capacity ?? '', urgentSignal: base?.urgentSignal ?? '', surplusSignal: base?.surplusSignal ?? '',
    idleSignal: base?.idleSignal ?? '', visibility: base?.visibility ?? 'Within',
    nodeStatus: needed || !base ? 'active' : base.nodeStatus, dateJoined: base?.dateJoined || today,
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof P, v: string) => setP((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!name.trim() || !p.organizationType.trim()) { setErr('Name and organization type are required.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateJoined)) { setErr('Date joined is required.'); return; }
    const partnerBody = { name: name.trim(), profile: p };
    // Any existing partner id (including profile needed) is updated; create is only for a brand-new partner with no id.
    cmd.mutate(
      { data: isNew ? { action: 'createPartner', partner: partnerBody } : { action: 'updatePartner', id: partner.id, partner: partnerBody } },
      { onSuccess: () => { toast({ title: 'Partner profile saved' }); onClose(); }, onError: (e) => setErr(errMsg(e)) },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? 'Add partner' : needed ? 'Create partner profile' : `Edit ${partner.name}`}</DialogTitle>
        <DialogDescription>Organization-level details only.</DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="text-partner-privacy">
        Privacy notice: do not enter personal information (individual names, personal phone numbers, personal emails, home addresses). Use a general organization channel such as a main line or shared inbox.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Organization name" className="sm:col-span-2"><Input data-testid="input-partner-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
        {TEXT.map((t) => (
          <Field key={t.k} label={t.label} className={t.long ? 'sm:col-span-2' : ''}>
            {t.long
              ? <Textarea rows={2} data-testid={`input-partner-${t.k}`} value={p[t.k]} maxLength={t.max} onChange={(e) => set(t.k, e.target.value)} />
              : <Input data-testid={`input-partner-${t.k}`} value={p[t.k]} maxLength={t.max} onChange={(e) => set(t.k, e.target.value)} />}
          </Field>
        ))}
        <Field label="Visibility">
          <NativeSelect data-testid="select-partner-visibility" value={p.visibility} onChange={(e) => set('visibility', e.target.value)}>
            <option value="Within">Within</option><option value="With">With</option><option value="Beyond">Beyond</option>
          </NativeSelect>
        </Field>
        <Field label="Node status">
          <NativeSelect data-testid="select-partner-nodestatus" value={p.nodeStatus} onChange={(e) => set('nodeStatus', e.target.value)}>
            <option value="active">Active</option><option value="paused">Paused</option>
            {needed && <option value="profile needed">Profile needed</option>}
          </NativeSelect>
        </Field>
        <Field label="Date joined"><Input type="date" data-testid="input-partner-datejoined" value={p.dateJoined} onChange={(e) => set('dateJoined', e.target.value)} /></Field>
      </div>
      {err && <p className="text-sm text-destructive" data-testid="text-partner-error">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button data-testid="button-save-partner" onClick={submit} disabled={cmd.isPending}>{cmd.isPending ? 'Saving...' : 'Save profile'}</Button>
      </DialogFooter>
    </>
  );
}

export function PartnerFormDialog({ partner, today, onClose }: { partner: NetworkPartner | NewPartner | null; today: string; onClose: () => void }) {
  return (
    <Dialog open={!!partner} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        {partner && <Body key={partner.id ?? 'new'} partner={partner} today={today} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
