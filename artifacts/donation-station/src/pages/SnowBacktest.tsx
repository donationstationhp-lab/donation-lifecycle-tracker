import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import {
  useGetNotionImportReport, getGetNotionImportReportQueryKey, useRunSnowRulesV2, useImportNotionItems,
  type NotionBacktestItem,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { SnowReview } from '@/components/SnowReview';
import { format } from 'date-fns';
import { Loader2, ExternalLink, Info, Download, Play, RefreshCw } from 'lucide-react';

type Filter = 'all' | 'different' | 'needsReview' | 'no_proposal' | 'no_accepted' | 'agree';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'different', label: 'Differences' }, { key: 'needsReview', label: 'Needs review' },
  { key: 'no_proposal', label: 'No proposal' }, { key: 'no_accepted', label: 'Proposal only' }, { key: 'agree', label: 'Agree' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : format(d, 'MMM d, yyyy h:mm a'); };

function notionUrl(pageId: string) {
  if (!UUID.test(pageId)) return null;
  return `https://www.notion.so/${pageId.replace(/-/g, '').toLowerCase()}`;
}

function CompareBadge({ c }: { c: NotionBacktestItem['comparison'] }) {
  const map = {
    agree: ['Agree', 'bg-emerald-100 text-emerald-900 border-emerald-300'],
    different: ['Disagreement', 'bg-red-100 text-red-900 border-red-300'],
    no_proposal: ['No proposal (rules abstained)', 'bg-slate-100 text-slate-700 border-slate-300'],
    no_accepted: ['Proposal without Notion tier', 'bg-amber-100 text-amber-900 border-amber-300'],
  } as const;
  const [l, cls] = map[c];
  return <Badge variant="outline" className={cls}>{l}</Badge>;
}

function SourceId({ it }: { it: NotionBacktestItem }) {
  const v = it.id ?? it.displayId;
  return v
    ? <span className="font-mono text-xs" data-testid={`text-source-id-${it.identityId}`}>{v}</span>
    : <span className="text-xs font-semibold text-amber-800" data-testid={`text-source-id-${it.identityId}`}>No ID — review required</span>;
}

export default function SnowBacktest() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const isSupervisor = user?.publicMetadata.role === 'supervisor';
  const { data, isLoading, isError, refetch, isFetching } = useGetNotionImportReport();
  const run = useRunSnowRulesV2();
  const imp = useImportNotionItems();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [confirmImport, setConfirmImport] = useState(false);
  const [selected, setSelected] = useState<NotionBacktestItem | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: getGetNotionImportReportQueryKey() });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.items ?? []).filter(i => {
      if (filter === 'needsReview' ? !i.needsReview : filter !== 'all' && i.comparison !== filter) return false;
      if (!term) return true;
      return [i.name, i.id, i.displayId, i.category, i.tier, i.notionPageId, ...i.flags].some(v => v?.toLowerCase().includes(term));
    });
  }, [data, filter, q]);

  const doRun = () => run.mutate(undefined, {
    onSuccess: r => { refresh(); toast({ title: 'Proposals run', description: `${r.evaluated} evaluated, ${r.proposed} proposed, ${r.abstained} abstained (${r.version}).` }); },
    onError: e => toast({ title: 'Proposal run failed', description: (e as Error).message, variant: 'destructive' }),
  });
  const doImport = () => imp.mutate(undefined, {
    onSuccess: r => { setConfirmImport(false); refresh(); toast({ title: 'Notion import complete', description: `Read ${r.read}, created ${r.created}, matched ${r.matched}, accepted imported ${r.acceptedImported}.` }); },
    onError: e => { setConfirmImport(false); toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' }); },
  });

  const s = data?.summary;
  const stats: [string, number | undefined][] = [
    ['Total', s?.total], ['Agree', s?.agree], ['Different', s?.different], ['No proposal', s?.noProposal], ['Proposal only', s?.noAccepted], ['Needs review', s?.needsReview],
  ];

  return (
    <div className="space-y-6" data-testid="page-snow-backtest">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">S.N.O.W. Backtest</h1>
          <p className="text-sm text-muted-foreground">Notion identity import and rules-v1 versus rules-v2 historical comparison. Staff only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-report">
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Reload report
          </Button>
          <Button variant="outline" onClick={doRun} disabled={run.isPending} data-testid="button-run-rules">
            {run.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />} Run rules-v2 proposals
          </Button>
          <Button onClick={() => setConfirmImport(true)} disabled={!isSupervisor || imp.isPending} title={isSupervisor ? undefined : 'Named supervisor only'} data-testid="button-import-notion">
            <Download className="w-4 h-4 mr-2" /> Import from Notion
          </Button>
        </div>
      </div>

      <Card className="border-amber-300 bg-amber-50/60" data-testid="card-disclaimer">
        <CardContent className="p-4 text-sm space-y-2 text-amber-950">
          <p className="font-semibold flex items-center gap-2"><Info className="w-4 h-4" /> How to read this report</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>This is a historical comparison, not food safety clearance and not a live consumption recommendation.</li>
            <li>rules-v2 adds freshly prepared perishable catering, restaurant, or kitchen food without label/date evidence: URGENT, same-day distribution only.</li>
            <li>Neither version proposes SURPLUS. Unknown facts otherwise cause abstention; non-food receives no proposal. No AI is involved. Comparisons and filters use v2; v1 remains visible alongside it.</li>
            <li>Homemade, unlabeled, or undated food is proposed URGENT for same-day distribution; homemade food has a 3-day ceiling from receipt. This does not change expiry dates.</li>
            <li>Importing and running proposals are separate actions. Loading this page does neither; the report can be re-evaluated without calling Notion.</li>
            {!isSupervisor && <li>Import requires a named supervisor. You can view the report and run a proposal-only batch.</li>}
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {stats.map(([l, n]) => (
          <Card key={l}><CardContent className="p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</p>
            {isLoading ? <Skeleton className="h-7 w-10 mt-1" /> : <p className="text-2xl font-bold" data-testid={`stat-${l.toLowerCase().replace(/ /g, '-')}`}>{n ?? 0}</p>}
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="text-lg">Identities</CardTitle>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <Input placeholder="Search name, ID, category, flag..." value={q} onChange={e => setQ(e.target.value)} className="lg:max-w-xs" data-testid="input-search" />
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(f => (
                <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>{f.label}</Button>
              ))}
            </div>
          </div>
          {data && <p className="text-xs text-muted-foreground" data-testid="text-report-meta">Report {data.version} generated {fmt(data.generatedAt)}. Showing {rows.length} of {data.items.length}.</p>}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : isError || !data ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50/50 p-6 space-y-3">
              <p className="font-medium text-red-700">The report could not be loaded.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-report">Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground" data-testid="empty-report">
              {data.items.length === 0 ? 'Nothing imported yet. A supervisor can run the Notion import.' : 'No identities match this filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-3">Source ID</th><th className="pr-3">Name</th><th className="pr-3">T.I.E.R.</th>
                    <th className="pr-3">Accepted (Notion)</th><th className="pr-3">Proposals: v1 vs v2</th><th className="pr-3">v2 comparison</th><th className="pr-3">Flags</th><th className="pr-3">Snapshot</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(i => {
                    const url = notionUrl(i.notionPageId);
                    return (
                      <tr key={i.identityId} className="border-b align-top hover:bg-secondary/40" data-testid={`row-backtest-${i.identityId}`}>
                        <td className="py-2 pr-3"><SourceId it={i} /></td>
                        <td className="pr-3 py-2 max-w-[220px]">
                          <p className="font-medium">{i.name}</p>
                          <p className="text-xs text-muted-foreground">{i.category}</p>
                          {url
                            ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1" data-testid={`link-notion-${i.identityId}`}>Notion page <ExternalLink className="w-3 h-3" /></a>
                            : <span className="text-xs text-muted-foreground">No valid Notion link</span>}
                        </td>
                        <td className="pr-3 py-2">{i.tier ?? <span className="text-muted-foreground">—</span>}
                          {i.tierConfirmation && <p className="text-xs text-muted-foreground max-w-[200px]">{i.tierConfirmation}</p>}</td>
                        <td className="pr-3 py-2">{i.acceptedFromNotion ?? <span className="text-muted-foreground">None</span>}
                          {i.currentAccepted !== i.acceptedFromNotion && <p className="text-xs text-muted-foreground">Now: {i.currentAccepted ?? 'None'}</p>}</td>
                        <td className="pr-3 py-2">
                          <p className="font-medium">v1: {i.proposalV1 ?? 'No proposal'}</p>
                          <CompareBadge c={i.comparisonV1} />
                          <p className="text-xs text-muted-foreground max-w-[220px]">{i.rationaleV1}</p>
                          <p className="font-medium mt-2">v2: {i.proposal ?? 'No proposal'}</p>
                          {i.rationale && <p className="text-xs text-muted-foreground max-w-[220px]">{i.rationale}</p>}</td>
                        <td className="pr-3 py-2 space-y-1"><CompareBadge c={i.comparison} />{i.needsReview && <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100 block w-fit">Needs review</Badge>}</td>
                        <td className="pr-3 py-2"><div className="flex flex-wrap gap-1 max-w-[160px]">{i.flags.map(f => <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>)}</div></td>
                        <td className="pr-3 py-2 text-xs text-muted-foreground">Edited {fmt(i.notionEditedAt)}<br />Imported {fmt(i.importedAt)}</td>
                        <td className="py-2"><Button size="sm" variant="outline" onClick={() => setSelected(i)} data-testid={`button-review-${i.identityId}`}>Review</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); refresh(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Notion-only identity: there is no inventory item page. Accepted from Notion stays {selected?.acceptedFromNotion ?? 'empty'} regardless of local review.
            </DialogDescription>
          </DialogHeader>
          {selected && <SnowReview itemId={selected.identityId} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmImport} onOpenChange={o => { if (!imp.isPending) setConfirmImport(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import from Notion?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This reads all Notion Item Log pages.</p>
                <p>Accepted classifications are initialized from staff decisions in Notion only on the first import of each identity.</p>
                <p>It never changes existing local acceptance and never writes to Notion. It does not run proposals.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={imp.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); doImport(); }} disabled={imp.isPending} data-testid="button-confirm-import">
              {imp.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Read Notion and import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
