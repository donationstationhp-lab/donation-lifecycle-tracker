import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetItemSnow, getGetItemSnowQueryKey, getGetItemQueryKey, useReviewItemSnow,
  type SnowTier,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, AlertTriangle, History } from 'lucide-react';
import { format } from 'date-fns';

const TIERS: SnowTier[] = ['URGENT', 'STABLE', 'SURPLUS'];
const fmt = (s: string) => format(new Date(s), 'MMM d, yyyy h:mm a');
const methodLabel: Record<string, string> = { confirmed: 'Confirmed proposal', overridden: 'Overridden by staff', manual: 'Set manually', notion_import: 'Staff decision imported from Notion' };

export function SnowReview({ itemId }: { itemId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = useGetItemSnow(itemId, {
    query: {
      enabled: !!itemId,
      queryKey: getGetItemSnowQueryKey(itemId),
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
    },
  });
  const review = useReviewItemSnow();

  const [mode, setMode] = useState<'confirm' | 'override' | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [tier, setTier] = useState<SnowTier | ''>('');
  const [reason, setReason] = useState('');
  const [stale, setStale] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const open = (m: 'confirm' | 'override') => {
    if (!data) return;
    setMode(m); setBaseVersion(data.version); setTier(''); setReason(''); setStale(false); setErrorMsg('');
  };
  const close = () => { setMode(null); setStale(false); setErrorMsg(''); };

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (isError || !data) {
    return (
      <Card className="shadow-sm border-red-200 bg-red-50/50">
        <CardContent className="p-6 space-y-3" role="alert">
          <p className="font-medium text-red-700">S.N.O.W. review could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const { proposal, accepted } = data;
  const versionMoved = mode !== null && data.version !== baseVersion;
  const conflict = stale || versionMoved;
  const sameAsProposal = !!proposal && tier === proposal.tier;
  const reasonOk = reason.trim().length > 0 && reason.trim().length <= 500;
  const canSubmit = !conflict && !review.isPending &&
    (mode === 'confirm' ? !!proposal : !!tier && !sameAsProposal && reasonOk);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetItemSnowQueryKey(itemId) });
    queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(itemId) });
    queryClient.invalidateQueries({ queryKey: ['/api/items'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
  };

  const submit = () => {
    if (!mode || !canSubmit) return;
    const body = mode === 'confirm'
      ? { action: 'confirm' as const, expectedVersion: baseVersion }
      : { action: 'override' as const, expectedVersion: baseVersion, tier: tier as SnowTier, reason: reason.trim() };
    review.mutate({ id: itemId, data: body }, {
      onSuccess: () => {
        close(); refreshAll();
        toast({ title: 'S.N.O.W. decision recorded' });
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 409) { setStale(true); refreshAll(); }
        else setErrorMsg((err as Error)?.message || 'The decision could not be saved.');
      },
    });
  };

  return (
    <Card className="shadow-sm" aria-labelledby="snow-title">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle id="snow-title" className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> S.N.O.W. Review
        </CardTitle>
        {data.awaitingReview
          ? <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100">Awaiting review</Badge>
          : <Badge variant="secondary">{accepted ? 'Reviewed' : 'No proposal'}</Badge>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section aria-label="Current proposal" className="rounded-lg border border-dashed border-border p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Proposal</h3>
            {proposal ? (
              <>
                <p className="text-xl font-bold">{proposal.tier}</p>
                <p className="text-xs text-muted-foreground">Source: {proposal.source}</p>
                <p className="text-xs text-muted-foreground">Proposed {fmt(proposal.proposedAt)}</p>
                <p className="text-sm">{proposal.rationale || <span className="text-muted-foreground">No rationale provided.</span>}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">No proposal has been made for this item.</p>}
          </section>
          <section aria-label="Accepted S.N.O.W." className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Accepted</h3>
            {accepted ? (
              <>
                <p className="text-xl font-bold">{accepted.tier}</p>
                <p className="text-xs text-muted-foreground">Method: {methodLabel[accepted.decision] ?? accepted.decision}</p>
                {accepted.source && <p className="text-xs text-muted-foreground">Source: {accepted.source}</p>}
                <p className="text-xs text-muted-foreground">By {accepted.by}</p>
                <p className="text-xs text-muted-foreground">{fmt(accepted.at)}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Nothing accepted yet. A new proposal never replaces this on its own.</p>}
          </section>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => open('confirm')} disabled={!proposal} className="flex-1 sm:flex-none">Confirm proposal</Button>
          <Button variant="outline" onClick={() => open('override')} className="flex-1 sm:flex-none">
            {proposal ? 'Override' : 'Set tier manually'}
          </Button>
          {isFetching && <span className="text-xs text-muted-foreground self-center" aria-live="polite">Refreshing...</span>}
        </div>

        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><History className="w-4 h-4 text-muted-foreground" /> Accepted history</h3>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">No decisions recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {[...data.history].sort((a, b) => b.version - a.version).map(h => (
                <li key={h.id} className="rounded-lg border border-border/60 p-3 text-sm space-y-1">
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="font-medium">{h.previousTier ?? 'None'} to {h.acceptedTier}</span>
                    <span className="text-xs text-muted-foreground">v{h.version} - {fmt(h.acceptedAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{methodLabel[h.decision] ?? h.decision} by {h.acceptedBy}</p>
                  {h.reason && <p className="italic text-foreground/80">"{h.reason}"</p>}
                  {h.proposal && (
                    <p className="text-xs text-muted-foreground">
                      Proposal then: {h.proposal.tier} from {h.proposal.source}, {fmt(h.proposal.proposedAt)}
                      {h.proposal.rationale ? ` - ${h.proposal.rationale}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
            {!!data.proposalHistory?.length && <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium">Proposal history — does not change acceptance</h4>
              {data.proposalHistory.map(p => <div key={p.id} className="rounded border p-3 text-sm">
                <p>{p.source}: {p.tier} · {fmt(p.proposedAt)}</p>
                <p className="text-xs text-muted-foreground">{p.rationale}</p>
              </div>)}
            </div>}
        </div>
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o && !review.isPending) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'confirm' ? 'Confirm proposed tier' : proposal ? 'Override proposal' : 'Set tier manually'}</DialogTitle>
            <DialogDescription>
              {mode === 'confirm'
                ? `Accept ${proposal?.tier} as this item's S.N.O.W. tier. Your staff identity and the time are recorded.`
                : 'Choose the tier and explain why. Your staff identity, the reason and the time are recorded.'}
            </DialogDescription>
          </DialogHeader>

          {conflict && (
            <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="w-4 h-4" /> Another staff member changed this review.</p>
              <p>Nothing was saved. Review the latest proposal and accepted tier, then decide again.</p>
              <Button size="sm" variant="outline" onClick={() => { refetch(); close(); }}>Refresh and review again</Button>
            </div>
          )}
          {errorMsg && <p role="alert" className="text-sm text-red-600">{errorMsg}</p>}

          {mode === 'override' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label htmlFor="snow-tier" className="text-sm font-medium">Accepted tier</label>
                <Select value={tier} onValueChange={(v) => setTier(v as SnowTier)}>
                  <SelectTrigger id="snow-tier"><SelectValue placeholder="Select a tier" /></SelectTrigger>
                  <SelectContent>{TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                {sameAsProposal && <p className="text-xs text-amber-700">This matches the proposal. Use Confirm proposal instead.</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="snow-reason" className="text-sm font-medium">Reason (required)</label>
                <Textarea id="snow-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={review.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {review.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {mode === 'confirm' ? 'Confirm tier' : 'Record decision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
