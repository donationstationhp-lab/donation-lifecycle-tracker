import { useNetwork } from '@/hooks/use-network';
import { NativeSelect, receivingAgents } from './bits';

export function AgentSelect({ value, onChange, id = 'receiving-agent' }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { data, isLoading, isError, refetch } = useNetwork();
  const list = data ? receivingAgents(data.agents) : [];
  return (
    <div className="space-y-1.5" data-testid="receiving-agent-field">
      <label htmlFor={id} className="text-sm font-medium">Receiving site (required)</label>
      <NativeSelect id={id} data-testid="select-receiving-agent" value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
        <option value="">{isLoading ? 'Loading sites...' : 'Choose the site that received this'}</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>{a.shortName}{a.status === 'seasonal' ? ' (seasonal)' : ''}</option>
        ))}
      </NativeSelect>
      {isError && (
        <p className="text-xs text-destructive">Could not load sites. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>
      )}
      {data && list.length === 0 && <p className="text-xs text-muted-foreground">No active or seasonal sites yet. Add one under Network.</p>}
    </div>
  );
}
