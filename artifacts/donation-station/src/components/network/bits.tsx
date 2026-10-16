import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { NetworkAgent, NetworkPartner, NetworkSnapshot } from '@workspace/api-client-react';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring ${props.className ?? ''}`}
    />
  );
}

export function NetworkLoading() {
  return (
    <div className="space-y-4" data-testid="network-loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center" data-testid="network-error">
      <p className="font-semibold">Could not load the network record.</p>
      <p className="text-sm text-muted-foreground mt-1">Nothing has been changed. Try again.</p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="font-medium text-sm">{title}</p>
      {body && <p className="text-xs text-muted-foreground mt-1">{body}</p>}
    </div>
  );
}

export function Section({ title, action, children, testId }: { title: string; action?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const fmtPounds = (n: number | null | undefined) => (n == null ? 'Pounds unknown' : `${n} lb`);

export function agentName(snap: NetworkSnapshot, id: string | null | undefined) {
  if (!id) return 'Unassigned';
  return snap.agents.find((a) => a.id === id)?.shortName ?? 'Unknown site';
}
export function partnerName(snap: NetworkSnapshot, id: string | null | undefined) {
  if (!id) return '';
  return snap.partners.find((p) => p.id === id)?.name ?? 'Unknown partner';
}
export const receivingAgents = (agents: NetworkAgent[]) => agents.filter((a) => a.status !== 'planned');
export type { NetworkAgent, NetworkPartner };
