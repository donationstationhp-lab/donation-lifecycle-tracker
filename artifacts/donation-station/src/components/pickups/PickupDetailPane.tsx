import { useGetPickup, getGetPickupQueryKey, useUpdatePickup, useDispatchPickup, getListPickupsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Phone, Clock, Truck, ShieldAlert, Flag, CheckCircle, AlertTriangle, MessageSquare, History, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  LogContactDialog,
  AssignRouteDialog,
  OutcomeDialog,
  CompletePickupDialog,
  FlagPickupDialog
} from "./PickupDialogs";

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    unverified: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
    contact_made: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300",
    confirmed: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-300",
    dispatched: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-300",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300",
    no_show: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300",
    false_address: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300",
    cancelled: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400",
    closed_no_response: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400",
  };
  return <Badge variant="outline" className={colors[status] || "bg-gray-100 text-gray-700"}>{status.replace(/_/g, ' ').toUpperCase()}</Badge>;
};

export function PickupDetailPane({ pickupId }: { pickupId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pickup, isLoading } = useGetPickup(pickupId, {
    query: { enabled: !!pickupId, queryKey: getGetPickupQueryKey(pickupId) }
  });

  const updatePickup = useUpdatePickup({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Pickup updated' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
      }
    }
  });

  const dispatchPickup = useDispatchPickup({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Pickup successfully dispatched' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
      },
      onError: (err: any) => {
        const errorMsg = err.error || err.response?.data?.error || 'Failed to dispatch';
        const missing = err.missing || err.response?.data?.missing || [];
        toast({
          variant: 'destructive',
          title: 'Cannot Dispatch',
          description: (
            <div className="mt-1">
              <p className="font-semibold">{errorMsg}</p>
              {missing.length > 0 && (
                <ul className="list-disc pl-4 mt-1 text-xs">
                  {missing.map((m: string) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )
        });
      }
    }
  });

  // Dialog States
  const [logContactOpen, setLogContactOpen] = useState(false);
  const [assignRouteOpen, setAssignRouteOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagContext, setFlagContext] = useState<{ value: string; type: 'phone' | 'address' }>({ value: '', type: 'address' });

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">Loading pickup details...</div>;
  }
  if (!pickup) return null;

  return (
    <div className="h-full flex flex-col bg-card rounded-md border shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="p-6 pb-4 border-b bg-muted/20">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">{pickup.name || 'Anonymous Donor'}</h2>
            <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
              <Clock className="w-4 h-4" /> {new Date(pickup.createdAt).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={pickup.status} />
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2 pt-2">
          {['unverified', 'contact_made', 'confirmed'].includes(pickup.status) && (
            <Button size="sm" variant="default" onClick={() => dispatchPickup.mutate({ id: pickup.id })} disabled={dispatchPickup.isPending}>
              <Truck className="w-4 h-4 mr-2" /> Dispatch Now
            </Button>
          )}

          {['unverified', 'contact_made'].includes(pickup.status) && (
            <Button size="sm" variant="outline" onClick={() => setLogContactOpen(true)}>
              <Phone className="w-4 h-4 mr-2" /> Log Contact
            </Button>
          )}

          {pickup.status === 'contact_made' && !pickup.confirmationSent && (
            <Button size="sm" variant="secondary" className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" onClick={() => updatePickup.mutate({ id: pickup.id, data: { confirmationSent: true } })}>
              <MessageSquare className="w-4 h-4 mr-2" /> Send Confirmation SMS
            </Button>
          )}

          {pickup.confirmationSent && !pickup.confirmationReplied && ['unverified', 'contact_made'].includes(pickup.status) && (
            <Button
              size="sm"
              variant="secondary"
              className="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
              onClick={() => updatePickup.mutate({ id: pickup.id, data: { confirmationReplied: true } })}
              disabled={updatePickup.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" /> Mark CONFIRM Reply
            </Button>
          )}

          {['confirmed', 'dispatched'].includes(pickup.status) && (
            <Button size="sm" variant="outline" onClick={() => setAssignRouteOpen(true)}>
              <MapPin className="w-4 h-4 mr-2" /> Assign Route
            </Button>
          )}

          {pickup.status === 'dispatched' && (
            <>
              <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCompleteOpen(true)}>
                <CheckCircle className="w-4 h-4 mr-2" /> Complete & Intake
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOutcomeOpen(true)}>
                <AlertTriangle className="w-4 h-4 mr-2" /> Record Issue
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Details Scroll Area */}
      <ScrollArea className="flex-1 p-6">
        {pickup.requiresSupervisorApproval && (
          <div className="mb-6 bg-red-50 text-red-700 border border-red-200 p-3 rounded-md flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Supervisor Approval Required</p>
              <p className="text-xs mt-0.5">This pickup triggered flags that must be cleared by a supervisor before dispatch.</p>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Contact Information</h3>
            
            <div className="bg-muted/30 p-3 rounded-md border flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{pickup.phone}</p>
                  <p className="text-xs text-muted-foreground">{pickup.contactAttempts} attempts logged</p>
                </div>
              </div>
              <div className="flex gap-2">
                {pickup.phoneFlagged && <Badge variant="destructive" className="h-6">Flagged</Badge>}
                <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setFlagContext({ type: 'phone', value: pickup.phone }); setFlagOpen(true); }} title="Flag Phone">
                  <Flag className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <div className="bg-muted/30 p-3 rounded-md border group">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium break-words pr-4">{pickup.address}</p>
                    <p className="text-xs text-muted-foreground capitalize">{pickup.addressType}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {pickup.addressFlagged && <Badge variant="destructive" className="h-6">Flagged</Badge>}
                  {!pickup.addressVerified && (
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => updatePickup.mutate({ id: pickup.id, data: { addressVerified: true } })}>Verify</Button>
                  )}
                  {pickup.addressVerified && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 h-6 border-emerald-200">Verified</Badge>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setFlagContext({ type: 'address', value: pickup.address }); setFlagOpen(true); }} title="Flag Address">
                    <Flag className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Pickup Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Requested Window</p>
                <p className="font-medium text-sm">{pickup.requestedWindow}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Confirmed Datetime</p>
                <p className="font-medium text-sm">{pickup.confirmedDatetime ? new Date(pickup.confirmedDatetime).toLocaleString() : 'Not set'}</p>
              </div>
            </div>
            {pickup.itemsDescribed && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Donor Description</p>
                <div className="bg-muted/30 p-3 rounded-md border text-sm">{pickup.itemsDescribed}</div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Dispatch checklist</h3>
            <div className="grid gap-2">
              {[
                { label: 'Donor name collected', complete: Boolean(pickup.name?.trim()) },
                { label: 'Address verified', complete: pickup.addressVerified },
                { label: 'Items described', complete: Boolean(pickup.itemsDescribed?.trim()) },
                { label: 'CONFIRM reply received', complete: pickup.confirmationReplied },
              ].map((step) => (
                <div
                  key={step.label}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    step.complete
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <span>{step.label}</span>
                  <span className="flex items-center gap-1 text-xs font-medium">
                    {step.complete ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {step.complete ? 'Ready' : 'Required'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Contact History */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Activity Log</h3>
            {pickup.contactHistory && pickup.contactHistory.length > 0 ? (
              <div className="space-y-2">
                {pickup.contactHistory.map(entry => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <div className="w-4 flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-border mt-1.5" />
                      <div className="w-px h-full bg-border -mb-2" />
                    </div>
                    <div className="pb-2">
                      <p className="font-medium capitalize">{entry.result.replace('_', ' ')} <span className="text-muted-foreground font-normal text-xs ml-2">{new Date(entry.createdAt).toLocaleString()}</span></p>
                      {entry.notes && <p className="text-muted-foreground mt-0.5">{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No contact attempts logged yet.</p>
            )}
          </div>

        </div>
      </ScrollArea>

      {/* Render Dialogs */}
      <LogContactDialog pickupId={pickupId} open={logContactOpen} onOpenChange={setLogContactOpen} />
      <AssignRouteDialog pickupId={pickupId} open={assignRouteOpen} onOpenChange={setAssignRouteOpen} />
      <OutcomeDialog pickupId={pickupId} open={outcomeOpen} onOpenChange={setOutcomeOpen} />
      <CompletePickupDialog pickupId={pickupId} open={completeOpen} onOpenChange={setCompleteOpen} />
      <FlagPickupDialog 
        pickupId={pickupId} 
        open={flagOpen} 
        onOpenChange={setFlagOpen} 
        defaultValue={flagContext.value} 
        defaultType={flagContext.type} 
      />
    </div>
  );
}
