import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Inbox, CheckCircle2, XCircle, PackageCheck } from 'lucide-react';
import {
  useListDonationOffers,
  useReviewDonationOffer,
  useReceiveDonationOffer,
  getListDonationOffersQueryKey,
  type DonationOffer,
  type DonationOfferInput,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AgentSelect } from '@/components/network/AgentSelect';
import { getGetNetworkQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

type Status = DonationOffer['status'];
const FILTERS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'submitted', label: 'Awaiting review' },
  { value: 'approved', label: 'Approved, not received' },
  { value: 'received', label: 'Received' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];
const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
  submitted: { label: 'Offer only - not received', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved - not yet received', cls: 'bg-blue-100 text-blue-800' },
  declined: { label: 'Declined', cls: 'bg-gray-200 text-gray-700' },
  received: { label: 'Physically received', cls: 'bg-emerald-100 text-emerald-800' },
};

function Details({ d }: { d: DonationOfferInput }) {
  const bits = [
    `Qty ${d.quantity ?? 1}`,
    d.category,
    d.condition,
    d.donorName && `Donor: ${d.donorName}`,
    d.perishable ? `Perishable${d.expiryDate ? ` (expires ${d.expiryDate})` : ''}` : null,
    d.temperatureZone,
    d.weight != null ? `${d.weight}kg` : null,
    d.origin && `From: ${d.origin}`,
    d.notes && `Notes: ${d.notes}`,
  ].filter(Boolean);
  return (
    <p className="text-xs text-muted-foreground break-words">{bits.join(' · ')}</p>
  );
}

interface FormState {
  name: string; donorName: string; category: string; condition: string; quantity: string;
  perishable: boolean; expiryDate: string; temperatureZone: string; weight: string; origin: string; notes: string;
}
const FIELDS = ['name', 'donorName', 'category', 'condition', 'quantity', 'perishable', 'expiryDate', 'temperatureZone', 'weight', 'origin', 'notes'] as const;
type FieldKey = (typeof FIELDS)[number];

function ReceiptField({ field, label, verified, onVerify, children }: {
  field: FieldKey; label: string; verified: boolean;
  onVerify: (value: boolean) => void; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`receipt-${field}`} className="font-semibold">{label}</Label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={verified} onCheckedChange={(v) => onVerify(v === true)} aria-label={`Verified ${label}`} />
          Verified
        </label>
      </div>
      {children}
    </div>
  );
}

function toForm(d: DonationOfferInput): FormState {
  return {
    name: d.name ?? '', donorName: d.donorName ?? '', category: d.category ?? '',
    condition: d.condition ?? 'good', quantity: String(d.quantity ?? 1), perishable: !!d.perishable,
    expiryDate: d.expiryDate ?? '', temperatureZone: d.temperatureZone ?? 'ambient',
    weight: d.weight != null ? String(d.weight) : '', origin: d.origin ?? '', notes: d.notes ?? '',
  };
}

function ReceiveDialog({ offer, onClose }: { offer: DonationOffer | null; onClose: () => void }) {
  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        {offer && <ReceiveForm key={offer.id} offer={offer} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ offer, onClose }: { offer: DonationOffer; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const receive = useReceiveDonationOffer();
  const [form, setForm] = useState<FormState>(() => toForm(offer.offeredDetails));
  const [checked, setChecked] = useState<Set<FieldKey>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [receivingAgentId, setReceivingAgentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allChecked = checked.size === FIELDS.length;

  function mark(k: FieldKey, on = true) {
    setChecked((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
    if (!on) setConfirmed(false);
  }
  function set<K extends FieldKey>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    mark(k);
    setConfirmed(false);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    const qty = Number(form.quantity);
    if (!receivingAgentId) return setError('Choose the receiving site.');
    if (!form.name.trim()) return setError('Name is required.');
    if (!Number.isInteger(qty) || qty < 1) return setError('Quantity must be a whole number of at least 1.');
    if (form.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate)) return setError('Expiry date must be YYYY-MM-DD.');
    if (form.weight && (!Number.isFinite(Number(form.weight)) || Number(form.weight) < 0)) return setError('Weight must be zero or more.');
    if (!allChecked || !confirmed) return setError('Verify every field and confirm physical receipt first.');
    const receivedDetails: DonationOfferInput = {
      name: form.name.trim(),
      donorName: form.donorName.trim(),
      category: form.category.trim(),
      condition: form.condition as DonationOfferInput['condition'],
      quantity: qty,
      perishable: form.perishable,
      expiryDate: form.expiryDate || null,
      temperatureZone: form.temperatureZone as DonationOfferInput['temperatureZone'],
      weight: form.weight ? Number(form.weight) : null,
      origin: form.origin.trim() || null,
      notes: form.notes,
    };
    setBusy(true);
    try {
      const item = await receive.mutateAsync({ id: offer.id, data: { receivingAgentId, detailsVerified: true, receivedDetails } });
      toast({ title: 'Receipt confirmed', description: `Inventory record ${item.itemId} created.` });
      qc.invalidateQueries({ queryKey: getGetNetworkQueryKey() });
      ['/api/items', '/api/dashboard', 'dashboard', 'pending-count', 'pending-items'].forEach((k) =>
        qc.invalidateQueries({ queryKey: k.startsWith('/') ? [k] : [k] }));
      qc.invalidateQueries({ queryKey: getListDonationOffersQueryKey() });
      onClose();
    } catch {
      toast({ title: 'Error', description: 'Could not confirm receipt.', variant: 'destructive' });
      setError('Could not confirm receipt. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm physical receipt</DialogTitle>
        <DialogDescription className="break-all">
          {offer.reference}. Check each field against the goods in hand, correct anything that differs, and mark it verified.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md bg-muted/40 border p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Original offer</p>
        <p className="text-sm font-medium break-words">{offer.offeredDetails.name}</p>
        <Details d={offer.offeredDetails} />
      </div>
      <div className="space-y-4">
        <AgentSelect value={receivingAgentId} onChange={setReceivingAgentId} id="receipt-receiving-agent" />
        <ReceiptField field="name" label="Name" verified={checked.has('name')} onVerify={(v) => mark('name', v)}>
          <Input id="receipt-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="donorName" label="Donor" verified={checked.has('donorName')} onVerify={(v) => mark('donorName', v)}>
          <Input id="receipt-donorName" value={form.donorName} onChange={(e) => set('donorName', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="category" label="Category" verified={checked.has('category')} onVerify={(v) => mark('category', v)}>
          <Input id="receipt-category" value={form.category} onChange={(e) => set('category', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="condition" label="Condition" verified={checked.has('condition')} onVerify={(v) => mark('condition', v)}>
          <Select value={form.condition} onValueChange={(v) => set('condition', v)}>
            <SelectTrigger id="receipt-condition"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['excellent', 'good', 'fair', 'poor'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReceiptField>
        <ReceiptField field="quantity" label="Quantity received" verified={checked.has('quantity')} onVerify={(v) => mark('quantity', v)}>
          <Input id="receipt-quantity" type="number" min="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="perishable" label="Perishable" verified={checked.has('perishable')} onVerify={(v) => mark('perishable', v)}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox id="receipt-perishable" checked={form.perishable} onCheckedChange={(v) => set('perishable', v === true)} /> Perishable goods
          </label>
        </ReceiptField>
        <ReceiptField field="expiryDate" label="Expiry date" verified={checked.has('expiryDate')} onVerify={(v) => mark('expiryDate', v)}>
          <Input id="receipt-expiryDate" type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="temperatureZone" label="Temperature zone" verified={checked.has('temperatureZone')} onVerify={(v) => mark('temperatureZone', v)}>
          <Select value={form.temperatureZone} onValueChange={(v) => set('temperatureZone', v)}>
            <SelectTrigger id="receipt-temperatureZone"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['ambient', 'refrigerated', 'frozen'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReceiptField>
        <ReceiptField field="weight" label="Weight (kg)" verified={checked.has('weight')} onVerify={(v) => mark('weight', v)}>
          <Input id="receipt-weight" type="number" min="0" step="any" value={form.weight} onChange={(e) => set('weight', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="origin" label="Origin" verified={checked.has('origin')} onVerify={(v) => mark('origin', v)}>
          <Input id="receipt-origin" value={form.origin} onChange={(e) => set('origin', e.target.value)} />
        </ReceiptField>
        <ReceiptField field="notes" label="Notes" verified={checked.has('notes')} onVerify={(v) => mark('notes', v)}>
          <Input id="receipt-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </ReceiptField>
      </div>
      <label className={`flex items-start gap-2 rounded-md border p-3 text-sm ${allChecked ? '' : 'opacity-60'}`}>
        <Checkbox
          className="mt-0.5"
          disabled={!allChecked}
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        <span>
          I confirm these goods have physically arrived and the details above are verified.
          {!allChecked && <span className="block text-xs text-muted-foreground">Verify all {FIELDS.length} fields to enable.</span>}
        </span>
      </label>
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !confirmed || !allChecked}>
          {busy ? 'Recording...' : 'Confirm physical receipt'}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function DonationOffers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | 'all'>('submitted');
  const [receiving, setReceiving] = useState<DonationOffer | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const review = useReviewDonationOffer();

  const { data, isLoading, isError, refetch } = useListDonationOffers({
    query: { queryKey: getListDonationOffersQueryKey(), staleTime: 10000, refetchInterval: 20000 },
  });

  async function decide(offer: DonationOffer, decision: 'approved' | 'declined') {
    if (actingOn) return;
    setActingOn(offer.id);
    try {
      await review.mutateAsync({ id: offer.id, data: { decision } });
      toast({
        title: decision === 'approved' ? 'Offer approved' : 'Offer declined',
        description: decision === 'approved'
          ? 'Permission to proceed only. Nothing is in inventory until receipt is confirmed.'
          : 'No inventory was created.',
      });
      qc.invalidateQueries({ queryKey: getListDonationOffersQueryKey() });
      qc.invalidateQueries({ queryKey: ['pending-count'] });
    } catch {
      toast({ title: 'Error', description: 'Could not update the offer.', variant: 'destructive' });
    } finally {
      setActingOn(null);
    }
  }

  const offers = data ?? [];
  const shown = filter === 'all' ? offers : offers.filter((o) => o.status === filter);
  const waiting = offers.filter((o) => o.status === 'submitted').length;

  return (
    <section className="space-y-4" aria-labelledby="offers-heading" data-testid="section-donation-offers">
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 rounded-full p-2"><Inbox className="w-5 h-5 text-blue-700" /></div>
        <div className="min-w-0">
          <h2 id="offers-heading" className="text-2xl font-bold tracking-tight">Donation Offers</h2>
          <p className="text-muted-foreground text-sm">
            Offers are promises, not goods. Nothing enters inventory until staff confirm physical receipt.
          </p>
        </div>
        {waiting > 0 && <Badge className="ml-auto bg-amber-500 hover:bg-amber-500 text-white">{waiting} awaiting</Badge>}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter offers by status">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'}
            aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} data-testid={`filter-offers-${f.value}`}>
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
      ) : isError ? (
        <div className="p-6 text-center bg-red-50 text-red-600 rounded-xl border border-red-200 space-y-2">
          <p>Failed to load donation offers.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : shown.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No offers in this view.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => {
            const st = STATUS_LABEL[o.status];
            const busy = actingOn === o.id;
            return (
              <Card key={o.id} data-testid={`card-offer-${o.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{o.offeredDetails.name}</p>
                      <p className="text-xs font-mono text-muted-foreground break-all">{o.reference}</p>
                      <p className="text-xs text-muted-foreground">Offered {format(new Date(o.createdAt), 'MMM d, h:mm a')}</p>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Original offer</p>
                    <Details d={o.offeredDetails} />
                  </div>
                  {o.status === 'received' && o.receivedDetails && (
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                        Received as verified{o.receivedBy ? ` by ${o.receivedBy}` : ''}
                        {o.receivedAt ? ` · ${format(new Date(o.receivedAt), 'MMM d, h:mm a')}` : ''}
                      </p>
                      <p className="text-sm font-medium break-words">{o.receivedDetails.name}</p>
                      <Details d={o.receivedDetails} />
                      {o.receivedItemId && (
                        <Link href={`/items/${o.receivedItemId}`} className="text-sm text-primary underline">View inventory item</Link>
                      )}
                    </div>
                  )}
                  {o.status === 'submitted' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Approving gives permission to proceed. It does not mean goods were received.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!!actingOn} onClick={() => decide(o, 'approved')} className="gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />{busy ? 'Working...' : 'Approve offer'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={!!actingOn} onClick={() => decide(o, 'declined')}
                          className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5">
                          <XCircle className="w-4 h-4" />Decline
                        </Button>
                      </div>
                    </div>
                  )}
                  {o.status === 'approved' && (
                    <Button size="sm" disabled={!!actingOn} onClick={() => setReceiving(o)} className="gap-1.5">
                      <PackageCheck className="w-4 h-4" />Confirm physical receipt
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ReceiveDialog offer={receiving} onClose={() => setReceiving(null)} />
    </section>
  );
}
