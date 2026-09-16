import { useState } from 'react';
import { ClipboardCheck, Plus, Settings, Filter, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useListPickups,
  ListPickupsStatus,
} from '@workspace/api-client-react';
import { CreatePickupDialog, ConfirmationTemplateDialog } from '@/components/pickups/PickupDialogs';
import { PickupDetailPane } from '@/components/pickups/PickupDetailPane';
import { useLocation } from 'wouter';

export default function Pickups() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const selectedId = searchParams.get('id');

  const [statusFilter, setStatusFilter] = useState<ListPickupsStatus | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const { data: pickups, isLoading } = useListPickups({
    ...(statusFilter !== 'all' ? { status: statusFilter } : {})
  });

  const handleSelect = (id: string) => {
    setLocation(`/pickups?id=${id}`);
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 pb-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch Desk</h1>
          <p className="text-muted-foreground text-sm">
            Verify, dispatch, and track donation pickup requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTemplateOpen(true)}>
            <Settings className="w-4 h-4 mr-2" /> SMS Template
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> New Pickup
          </Button>
        </div>
      </div>

      {/* Main Content Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden min-h-[500px]">

        {/* Left List Pane */}
        <div className="lg:col-span-1 flex flex-col border rounded-md bg-card shadow-sm overflow-hidden">
          <div className="p-3 border-b bg-muted/10 flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 flex-1">
                <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
                <SelectItem value="contact_made">Contact Made</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading pickups...</div>
            ) : !pickups || pickups.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <ClipboardCheck className="w-10 h-10 mb-3 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground text-sm">No pickups found.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pickups.map(pickup => (
                  <button
                    key={pickup.id}
                    onClick={() => handleSelect(pickup.id)}
                    className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${selectedId === pickup.id ? 'bg-muted/80 border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold text-sm truncate pr-2">{pickup.phone}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 h-5 shrink-0 bg-white dark:bg-slate-900">
                        {pickup.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{pickup.address}</p>
                    <div className="flex gap-2 mt-2">
                      {pickup.addressFlagged && <span className="text-[10px] font-medium text-red-600 bg-red-100 px-1.5 rounded-sm">Flagged</span>}
                      {pickup.requiresSupervisorApproval && <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 rounded-sm">Needs Approval</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-2 overflow-hidden h-full">
          {selectedId ? (
            <PickupDetailPane pickupId={selectedId} />
          ) : (
            <div className="h-full border rounded-md border-dashed bg-card/50 flex flex-col items-center justify-center p-8 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <ClipboardCheck className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="text-lg font-medium">Select a pickup</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Choose a pickup from the list to inspect details, log contact attempts, verify addresses, or dispatch drivers.
              </p>
            </div>
          )}
        </div>
      </div>

      <CreatePickupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmationTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </div>
  );
}
