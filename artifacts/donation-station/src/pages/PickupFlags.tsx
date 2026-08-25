import { useState } from 'react';
import { Flag, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListPickupFlags,
  useUpdatePickupFlag,
  getListPickupFlagsQueryKey,
} from '@workspace/api-client-react';

export default function PickupFlags() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: flags, isLoading } = useListPickupFlags();

  const approveFlag = useUpdatePickupFlag({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Flag supervisor-approved' });
        queryClient.invalidateQueries({ queryKey: getListPickupFlagsQueryKey() });
        // We could also invalidate pickups but the user typically navigates back
      }
    }
  });

  const pendingFlags = flags?.filter(f => !f.supervisorApproved) || [];
  const approvedFlags = flags?.filter(f => f.supervisorApproved) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Flag className="w-6 h-6 text-red-500" />
          Flag Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review and approve flagged phones and addresses reported by staff.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-red-200 shadow-sm">
          <CardHeader className="bg-red-50/50 pb-4">
            <CardTitle className="text-red-700 flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5" /> Requires Supervisor Approval
            </CardTitle>
            <CardDescription>
              These values have been flagged. Associated pickups cannot be dispatched until a supervisor approves the flag.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading flags...</div>
            ) : pendingFlags.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No pending flags to review.
              </div>
            ) : (
              <div className="divide-y">
                {pendingFlags.map(flag => (
                  <div key={flag.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-card">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{flag.type}</Badge>
                        <span className="font-semibold text-sm">{flag.value}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{flag.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">Reported {flag.count} time{flag.count > 1 ? 's' : ''}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                      onClick={() => approveFlag.mutate({ id: flag.id, data: { supervisorApproved: true } })}
                      disabled={approveFlag.isPending}
                    >
                      <ShieldCheck className="w-4 h-4 mr-2" /> Approve & Override
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {approvedFlags.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Approved Flags</CardTitle>
              <CardDescription>
                Historical record of flags that have been supervisor-approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y opacity-70">
                {approvedFlags.map(flag => (
                  <div key={flag.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">{flag.type}</Badge>
                        <span className="font-medium text-sm">{flag.value}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{flag.reason}</p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Approved
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
