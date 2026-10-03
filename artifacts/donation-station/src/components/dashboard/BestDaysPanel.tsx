import { useEffect, useRef, useState } from 'react';
import { getGetConScireWindowsQueryKey, useGetConScireWindows } from '@workspace/api-client-react';
import type { ConScireWindow } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';

const GROUPS = [
  { key: 'intake', label: 'Intake' },
  { key: 'qc', label: 'Quality check' },
  { key: 'storage', label: 'Storage' },
  { key: 'distributed', label: 'Distributed' },
] as const;
type GroupKey = (typeof GROUPS)[number]['key'];

const PARAMS = { stage: 'all', days: '30' } as const;
const utcToday = () => new Date().toISOString().slice(0, 10);

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
};
const isGold = (w: ConScireWindow) => w.aligned && w.convergence === 6;
const GOLD = 'border-amber-400 bg-amber-100/70 text-amber-950';

export function BestDaysPanel() {
  const [today, setToday] = useState(utcToday);
  const [filter, setFilter] = useState<'all' | GroupKey>('all');

  const query = useGetConScireWindows(PARAMS, {
    query: {
      queryKey: getGetConScireWindowsQueryKey(PARAMS),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });
  const { refetch } = query;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setToday(utcToday());
        refetch();
        schedule();
      }, Math.min(next - now.getTime(), 2 ** 31 - 1));
    };
    schedule();
    const onVis = () => {
      if (document.visibilityState === 'visible') setToday(utcToday());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refetch]);

  const data = query.data;
  const startDay = data ? data.startDate.slice(0, 10) : '';
  const isCurrent = !!data && startDay === today;
  const staleAttempt = useRef<string | null>(null);
  // Stale previous-day data: refetch once per UTC day (no tight retry loop).
  useEffect(() => {
    if (data && startDay !== today && staleAttempt.current !== today && !query.isFetching) {
      staleAttempt.current = today;
      refetch();
    }
  }, [data, startDay, today, query.isFetching, refetch]);

  const stages = (isCurrent ? data?.stages : undefined) ?? {};
  const groups = GROUPS.map((g) => ({
    ...g,
    windows: [...(stages[g.key] ?? [])].sort((x: ConScireWindow, y: ConScireWindow) => x.date.localeCompare(y.date)),
  }));
  const visible = groups.filter((g) => filter === 'all' || g.key === filter);
  const total = visible.reduce((n, g) => n + g.windows.length, 0);
  const goldCount = visible.reduce((n, g) => n + g.windows.filter(isGold).length, 0);
  let endDate = '';
  const rangeDays: string[] = [];
  if (data) {
    const end = new Date(data.startDate);
    end.setUTCDate(end.getUTCDate() + data.days - 1);
    endDate = end.toISOString().slice(0, 10);
    const cur = new Date(`${startDay}T00:00:00.000Z`);
    for (let i = 0; i < data.days; i++) {
      rangeDays.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  const staleGaveUp = !!data && !isCurrent && !query.isFetching && staleAttempt.current === today;
  const showError = query.isError || staleGaveUp;
  const loading = !showError && (query.isLoading || (!!data && !isCurrent));
  const ready = !loading && !showError && isCurrent;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="best-days-heading" data-testid="panel-best-days">
      <div className="mb-4">
        <h2 id="best-days-heading" className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          Best Days
        </h2>
        <p className="text-sm text-muted-foreground font-medium mt-1">
          Purpose-governed windows for the next 30 days (UTC), grouped by lifecycle stage.
        </p>
      </div>
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {isCurrent && data ? (
              <span data-testid="text-best-days-range">
                <time dateTime={startDay}>{fmt(startDay, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                {' to '}
                <time dateTime={endDate}>{fmt(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                <span className="text-sm font-medium text-muted-foreground"> · {data.days} days, UTC</span>
              </span>
            ) : (
              'Next 30 days'
            )}
          </CardTitle>
          <CardDescription>
            Lifecycle group (Intake, QC, Storage, Distributed) is the service stage. The cognitive stage name is a separate 16-stage cycle.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 text-xs font-medium text-muted-foreground" data-testid="legend-best-days">
            <span className="inline-flex items-center gap-1.5">
              <span className={`rounded border px-1.5 py-0.5 font-bold ${GOLD}`}>✦</span>
              Gold: aligned date with convergence 6
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded border border-border bg-muted px-1.5 py-0.5">Plain</span>
              Purpose-governed window (not gold)
            </span>
          </div>
          <div role="group" aria-label="Filter by lifecycle stage" className="flex flex-wrap gap-2 pt-3">
            {[{ key: 'all', label: 'All stages' }, ...GROUPS].map((g) => (
              <Button
                key={g.key}
                type="button"
                size="sm"
                variant={filter === g.key ? 'default' : 'outline'}
                aria-pressed={filter === g.key}
                data-testid={`button-best-days-filter-${g.key}`}
                onClick={() => setFilter(g.key as 'all' | GroupKey)}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && (
            <div className="space-y-3" role="status" aria-label="Loading best days">
              <Skeleton className="h-6 w-40" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            </div>
          )}
          {showError && (
            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive flex flex-wrap items-center justify-between gap-3">
              {query.isError ? 'Could not load Best Days windows.' : 'Best Days data is not current for today (UTC).'}
              <Button type="button" size="sm" variant="outline" data-testid="button-best-days-retry" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}
          {ready && total === 0 && (
            <p className="text-sm font-medium text-muted-foreground" data-testid="text-best-days-empty">
              No purpose-governed windows were returned for this range.
            </p>
          )}
          {ready && total > 0 && goldCount === 0 && (
            <p className="text-sm font-medium text-muted-foreground" data-testid="text-best-days-no-gold">
              No ✦ gold days (aligned with convergence 6) in {filter === 'all' ? 'this range' : 'the selected group'}.
            </p>
          )}
          {ready && total > 0 && (
            <p className="sr-only" aria-live="polite">{goldCount} gold days in range.</p>
          )}
          {ready && total > 0 &&
            visible.map((g) => (
              <div key={g.key} data-testid={`group-best-days-${g.key}`}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">
                  {g.label}
                  <span className="ml-2 text-xs font-medium normal-case tracking-normal text-muted-foreground">
                    {g.windows.length} {g.windows.length === 1 ? 'window' : 'windows'}
                  </span>
                </h3>
                <Calendar group={g.key} days={rangeDays} windows={g.windows} onPick={jump} />
                {g.windows.length > 0 && (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${g.label} window details`}>
                    {g.windows.map((w) => {
                      const gold = isGold(w);
                      return (
                        <li
                          key={`${g.key}-${w.date}`}
                          id={`best-day-${g.key}-${w.date}`}
                          tabIndex={-1}
                          data-testid={`card-best-day-${g.key}-${w.date}`}
                          className={`rounded-lg border p-3 text-sm scroll-mt-4 focus:outline-none focus:ring-2 focus:ring-ring ${gold ? GOLD : 'border-border bg-card'}`}
                        >
                          <div className="flex items-center justify-between gap-2 font-semibold">
                            <time dateTime={w.date}>{fmt(w.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</time>
                            {gold && (
                              <span className="font-bold" title="Gold: aligned, convergence 6">
                                ✦<span className="sr-only"> Gold day, aligned, convergence 6</span>
                              </span>
                            )}
                          </div>
                          <dl className="mt-2 space-y-1 text-xs">
                            <div><dt className="inline font-semibold">Purpose {w.purposePosition}: </dt><dd className="inline">{w.purposeName}</dd></div>
                            <div><dt className="inline font-semibold">Cognitive stage {w.stage}/16: </dt><dd className="inline">{w.stageName}</dd></div>
                            <div><dt className="inline font-semibold">Etymology: </dt><dd className="inline">{w.stageEtymology}</dd></div>
                            <div><dt className="inline font-semibold">Convergence: </dt><dd className="inline">{w.convergence}{w.aligned ? ', aligned' : ', not aligned'}</dd></div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </section>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Calendar({ group, days, windows, onPick }: { group: string; days: string[]; windows: ConScireWindow[]; onPick: (id: string) => void }) {
  const byDate = new Map(windows.map((w) => [w.date, w]));
  const lead = days.length ? new Date(`${days[0]}T00:00:00.000Z`).getUTCDay() : 0;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid={`calendar-best-days-${group}`}>
      <table className="w-full min-w-[420px] table-fixed text-center">
        <caption className="sr-only">{group} calendar, next 30 days in UTC</caption>
        <thead>
          <tr>{WEEKDAYS.map((d) => (
            <th key={d} scope="col" className="border-b border-border bg-muted/50 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{d}</th>
          ))}</tr>
        </thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => (
          <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((iso, i) => {
          if (!iso) return <td key={`b${i}`} className="h-12 border-b border-r border-border/40 bg-muted/20" />;
          const w = byDate.get(iso);
          const day = Number(iso.slice(8));
          const label = fmt(iso, { month: 'short', day: 'numeric' });
          const first = day === 1 || iso === days[0];
          const base = 'min-h-12 p-1 text-xs flex flex-col items-center justify-start';
          if (!w) {
            return (
              <td key={iso} className="border-b border-r border-border/40 align-top">
                <div className={`${base} text-muted-foreground/60`} aria-label={`${label}: no window`}>
                {first && <span className="text-[9px] uppercase">{fmt(iso, { month: 'short' })}</span>}
                <span>{day}</span>
                </div>
              </td>
            );
          }
          const gold = isGold(w);
          return (
            <td key={iso} className="border-b border-r border-border/40 align-top">
              <button
              type="button"
              data-testid={`cell-best-day-${group}-${iso}`}
              onClick={() => onPick(`best-day-${group}-${iso}`)}
              aria-label={`${label}: ${gold ? 'gold day, ' : ''}purpose ${w.purposePosition} ${w.purposeName}, ${w.stageName}. Show details`}
              className={`${base} w-full font-semibold hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${gold ? GOLD : 'bg-card text-foreground'}`}
            >
              {first && <span className="text-[9px] uppercase">{fmt(iso, { month: 'short' })}</span>}
              <span>{day}</span>
              <span className="text-[10px] leading-none">{gold ? '✦' : `P${w.purposePosition}`}</span>
              </button>
            </td>
          );
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
