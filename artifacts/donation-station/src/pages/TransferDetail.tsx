import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { 
  useGetTransfer, 
  getGetTransferQueryKey, 
  useTransitionTransfer,
  TransferStatus,
  getGetItemQueryKey,
  getListTransfersQueryKey,
  getGetClaimQueryKey,
  getListClaimsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, ArrowRightLeft, User, Package, FileText, CheckCircle2, 
  History, Loader2, LogOut, Download, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { TransferStatusBadge } from './TransfersList';

export default function TransferDetail() {
  const [, params] = useRoute('/transfers/:id');
  const id = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: transfer, isLoading, isError } = useGetTransfer(id, { 
    query: { enabled: !!id, queryKey: getGetTransferQueryKey(id) } 
  });

  const transitionTransfer = useTransitionTransfer();

  const [isReleaseOpen, setIsReleaseOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !transfer) {
    return (
      <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">Transfer Not Found</h2>
        <p className="mb-6">The transfer you are looking for does not exist or an error occurred.</p>
        <Link href="/transfers">
          <Button variant="outline">Return to Transfers</Button>
        </Link>
      </div>
    );
  }

  const invalidateTransferQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetTransferQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(transfer.itemId) });
    queryClient.invalidateQueries({ queryKey: ['/api/items'] });
    queryClient.invalidateQueries({ queryKey: getGetClaimQueryKey(transfer.claimId) });
    queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey() });
  };

  const handleStatusChange = (status: TransferStatus, modalSetter: (val: boolean) => void) => {
    transitionTransfer.mutate({ id, data: { status, notes: transitionNotes || undefined } }, {
      onSuccess: () => {
        toast({ title: `Transfer marked as ${status}` });
        invalidateTransferQueries();
        modalSetter(false);
        setTransitionNotes('');
      },
      onError: (err: any) => {
        toast({ title: 'Status update failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/transfers">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Transfer Details</h1>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Created on {format(new Date(transfer.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          {transfer.status === 'planned' && (
            <Button 
              onClick={() => setIsReleaseOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Release Item
            </Button>
          )}
          {transfer.status === 'released' && (
            <Button 
              onClick={() => setIsReceiveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white shadow-sm whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 mr-2" />
              Confirm Receipt
            </Button>
          )}
          {(transfer.status === 'planned' || transfer.status === 'released') && (
            <Button
              variant="outline"
              onClick={() => setIsCancelOpen(true)}
              className="text-gray-600 hover:text-gray-900 shrink-0"
            >
              Cancel Transfer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm bg-blue-50/50 border-blue-100">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                Chain of Custody
              </CardTitle>
              <CardDescription className="text-blue-700/70">
                Tracking the physical movement of the item to its designated recipient.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between border-b border-blue-200 pb-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-blue-800 uppercase">Released By</span>
                  <span className="text-sm">{transfer.releasedBy || 'Pending'}</span>
                </div>
                <ArrowRightLeft className="w-6 h-6 text-blue-300 mx-4" />
                <div className="flex flex-col gap-1 text-right">
                  <span className="text-xs font-semibold text-blue-800 uppercase">Received By</span>
                  <span className="text-sm">{transfer.receivedBy || 'Pending'}</span>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm text-sm">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block mb-1">Associated Claim Reference</span>
                    <Link href={`/claims/${transfer.claim.id}`} className="text-blue-600 hover:underline">
                      View Claim Documentation
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Recipient Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Name</span>
                  <p className="font-medium">{transfer.account.name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Type</span>
                  <p className="font-medium capitalize">{transfer.account.type}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Assigned Item
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Item Name</span>
                  <p className="font-medium">
                    <Link href={`/items/${transfer.item.id}`} className="hover:underline hover:text-primary">
                      {transfer.item.name}
                    </Link>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Item ID</span>
                  <p className="font-mono text-sm">{transfer.item.itemId}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Current Stage</span>
                  <p className="font-medium capitalize">{transfer.item.stage}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                Transfer History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-border ml-3 space-y-6">
                {transfer.history.map((entry, index) => {
                  const isLatest = index === transfer.history.length - 1;
                  return (
                    <div key={entry.id} className="pl-6 relative">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${isLatest ? 'bg-primary ring-2 ring-primary/20' : 'bg-muted-foreground/30'}`} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm capitalize">{entry.toStatus}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(entry.timestamp || new Date()), 'MMM d, h:mm a')}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">by {entry.by}</span>
                        {entry.notes && (
                          <div className="mt-2 text-sm bg-secondary/50 p-2 rounded border border-border/50 text-foreground/80 italic">
                            "{entry.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isReleaseOpen} onOpenChange={setIsReleaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Item</DialogTitle>
            <DialogDescription>
              You are physically releasing this item from storage for transfer.
              Ensure the recipient or courier is present.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsReleaseOpen(false)}>Cancel</Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-white" 
              onClick={() => handleStatusChange('released', setIsReleaseOpen)}
              disabled={transitionTransfer.isPending}
            >
              {transitionTransfer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
            <DialogDescription className="text-red-600 font-medium">
              Important: Confirming receipt will permanently mark this item as distributed.
            </DialogDescription>
            <DialogDescription className="mt-2">
              This action verifies that the intended recipient has taken final custody of the item. It will be removed from active storage inventory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsReceiveOpen(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={() => handleStatusChange('received', setIsReceiveOpen)}
              disabled={transitionTransfer.isPending}
            >
              {transitionTransfer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Distribute Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Transfer</DialogTitle>
            <DialogDescription>
              This will cancel the transfer process. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for cancellation (optional)..."
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelOpen(false)}>Close</Button>
            <Button 
              variant="destructive"
              onClick={() => handleStatusChange('cancelled', setIsCancelOpen)}
              disabled={transitionTransfer.isPending}
            >
              {transitionTransfer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Cancel Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
