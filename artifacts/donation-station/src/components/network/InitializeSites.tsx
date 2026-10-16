import { useState } from 'react';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetNetworkQueryKey, useInitializeNetworkSites } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errMsg } from '@/hooks/use-network';

export function InitializeSites() {
  const { user } = useUser();
  const qc = useQueryClient();
  const initialize = useInitializeNetworkSites();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user?.publicMetadata.role !== 'supervisor') return null;
  const save = () => {
    if (!confirmed) return;
    setError('');
    initialize.mutate({ data: { confirmed: true } }, {
      onSuccess: result => {
        setMessage(`${result.created} sites created; ${result.existing} existing sites preserved. No organizations created.`);
        qc.invalidateQueries({ queryKey: getGetNetworkQueryKey() });
        setOpen(false);
        setConfirmed(false);
      },
      onError: failure => setError(errMsg(failure)),
    });
  };
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-label="Supervisor site setup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Supervisor site setup</h2>
          <p className="text-sm text-muted-foreground">Initialize the three standard agents in this environment. Safe to rerun; existing sites are never overwritten.</p>
        </div>
        <Button variant="outline" data-testid="button-initialize-sites" onClick={() => { setConfirmed(false); setError(''); setOpen(true); }}>Initialize standard sites</Button>
      </div>
      {message && <p role="status" className="text-sm" data-testid="text-initialize-result">{message}</p>}
      <Dialog open={open} onOpenChange={value => { if (!initialize.isPending) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Initialize the three standard sites?</DialogTitle>
            <DialogDescription>This acts only in the environment you are currently viewing. It creates missing sites, preserves existing records, and stops without changes if any number/name identity conflicts.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal pl-5 space-y-3 text-sm">
            <li><strong>Headquarters (Hyde Park)</strong><br />5303 S. Woodlawn · CIA-provided · active<br />Intake point for Hyde Park sources.</li>
            <li><strong>Market Headquarters</strong><br />Chicago Vegan Farmers Market · host-permitted · seasonal</li>
            <li><strong>Iyanna&apos;s (Englewood)</strong><br />1809 W. 69th · CIA-provided · active<br />Shipping container and work vehicles are located here.</li>
          </ol>
          <p className="text-sm">New sites have owner CIA, operator Donation Station, and blank SKUs. No partner organizations, inventory, DS numbers, or Notion records are created.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" data-testid="checkbox-initialize-sites" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={initialize.isPending} />
            I confirm initialization in this environment.
          </label>
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-initialize-error">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={initialize.isPending}>Cancel</Button>
            <Button data-testid="button-confirm-initialize-sites" onClick={save} disabled={!confirmed || initialize.isPending}>{initialize.isPending ? 'Checking sites…' : 'Confirm initialization'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
