import { useState } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { 
  useGetClaim, 
  getGetClaimQueryKey, 
  useAddClaimEvidence, 
  useTransitionClaim, 
  useCreateTransfer,
  ClaimEvidenceInputKind,
  ClaimStatus,
  getListClaimsQueryKey,
  getListTransfersQueryKey,
  getGetItemQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { 
  ArrowLeft, FileText, User, Package, CheckCircle2, ShieldCheck, 
  Clock, Plus, History, ArrowRightLeft, Loader2, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ClaimStatusBadge } from './ClaimsList';

const evidenceSchema = z.object({
  kind: z.enum(['identity', 'eligibility', 'need']),
  reference: z.string().min(1, 'Reference is required'),
  note: z.string().min(1, 'Note is required'),
});

type EvidenceValues = z.infer<typeof evidenceSchema>;

export default function ClaimDetail() {
  const [, params] = useRoute('/claims/:id');
  const id = params?.id || '';
  
  const { user } = useUser();
  const isSupervisor = user?.publicMetadata.role === 'supervisor';

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: claim, isLoading, isError } = useGetClaim(id, { 
    query: { enabled: !!id, queryKey: getGetClaimQueryKey(id) } 
  });

  const addEvidence = useAddClaimEvidence();
  const transitionClaim = useTransitionClaim();
  const createTransfer = useCreateTransfer();

  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');

  const [, setLocation] = useLocation();

  const evidenceForm = useForm<EvidenceValues>({
    resolver: zodResolver(evidenceSchema),
    defaultValues: { kind: 'identity', reference: '', note: '' }
  });

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

  if (isError || !claim) {
    return (
      <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">Claim Not Found</h2>
        <p className="mb-6">The claim you are looking for does not exist or an error occurred.</p>
        <Link href="/claims">
          <Button variant="outline">Return to Claims</Button>
        </Link>
      </div>
    );
  }

  const invalidateClaimQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetClaimQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(claim.itemId) });
    queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['/api/items'] });
  };

  const onEvidenceSubmit = (data: EvidenceValues) => {
    addEvidence.mutate({ id, data: { ...data, kind: data.kind as ClaimEvidenceInputKind } }, {
      onSuccess: () => {
        toast({ title: 'Evidence added' });
        invalidateClaimQueries();
        setIsEvidenceOpen(false);
        evidenceForm.reset();
      },
      onError: (err: any) => {
        toast({ title: 'Failed to add evidence', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleStatusChange = (status: ClaimStatus, modalSetter: (val: boolean) => void) => {
    transitionClaim.mutate({ id, data: { status, notes: transitionNotes || undefined } }, {
      onSuccess: () => {
        toast({ title: `Claim marked as ${status}` });
        invalidateClaimQueries();
        modalSetter(false);
        setTransitionNotes('');
      },
      onError: (err: any) => {
        toast({ title: 'Status update failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleCreateTransfer = () => {
    createTransfer.mutate({
      data: {
        claimId: claim.id,
        accountId: claim.accountId,
        itemId: claim.itemId,
        notes: 'Generated from approved claim'
      }
    }, {
      onSuccess: (transfer) => {
        toast({ title: 'Transfer created' });
        invalidateClaimQueries();
        setIsTransferOpen(false);
        setLocation(`/transfers/${transfer.id}`);
      },
      onError: (err: any) => {
        toast({ title: 'Failed to create transfer', description: err.message, variant: 'destructive' });
      }
    });
  };

  const hasIdentity = claim.evidence.some(e => e.kind === 'identity');
  const hasEligibility = claim.evidence.some(e => e.kind === 'eligibility');
  const hasNeed = claim.evidence.some(e => e.kind === 'need');
  const canVerify = hasIdentity && hasEligibility && hasNeed && claim.status === 'submitted';

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/claims">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Claim Details</h1>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Created on {format(new Date(claim.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          {claim.status === 'submitted' && (
            <Button 
              onClick={() => setIsVerifyOpen(true)}
              disabled={!canVerify}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Verify Claim
            </Button>
          )}
          {claim.status === 'verified' && isSupervisor && (
            <Button 
              onClick={() => setIsApproveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white shadow-sm whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve Claim
            </Button>
          )}
          {claim.status === 'approved' && (
            <Button 
              onClick={() => setIsTransferOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm whitespace-nowrap shrink-0"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Create Transfer
            </Button>
          )}
          {(claim.status === 'submitted' || claim.status === 'verified') && (
            <Button
              variant="outline"
              onClick={() => setIsRejectOpen(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          )}
          {(claim.status === 'submitted' || claim.status === 'verified' || claim.status === 'approved') && (
            <Button
              variant="outline"
              onClick={() => setIsCancelOpen(true)}
              className="text-gray-600 hover:text-gray-900 shrink-0"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Evidence Record
              </CardTitle>
              <CardDescription>
                Three pieces of evidence are required for verification: Identity, Eligibility, and Need.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wider">Submitted Evidence</h3>
                {claim.status === 'submitted' && (
                  <Button variant="outline" size="sm" onClick={() => setIsEvidenceOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Add Evidence
                  </Button>
                )}
              </div>
              
              {claim.evidence.length === 0 ? (
                <div className="p-8 text-center bg-secondary/50 rounded-lg border border-dashed border-border text-muted-foreground text-sm">
                  No evidence added yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {claim.evidence.map(ev => (
                    <div key={ev.id} className="p-3 border border-border rounded-lg bg-white flex flex-col md:flex-row gap-4 items-start md:items-center">
                      <Badge variant="secondary" className="capitalize whitespace-nowrap">
                        {ev.kind}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{ev.reference}</div>
                        <div className="text-xs text-muted-foreground mt-1">{ev.note}</div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(ev.createdAt), 'MMM d')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
                <div className={`p-2 rounded flex flex-col items-center justify-center text-center border ${hasIdentity ? 'bg-green-50 border-green-200 text-green-700' : 'bg-secondary border-border text-muted-foreground'}`}>
                  {hasIdentity ? <CheckCircle2 className="w-5 h-5 mb-1" /> : <Clock className="w-5 h-5 mb-1 opacity-50" />}
                  <span className="text-xs font-medium">Identity</span>
                </div>
                <div className={`p-2 rounded flex flex-col items-center justify-center text-center border ${hasEligibility ? 'bg-green-50 border-green-200 text-green-700' : 'bg-secondary border-border text-muted-foreground'}`}>
                  {hasEligibility ? <CheckCircle2 className="w-5 h-5 mb-1" /> : <Clock className="w-5 h-5 mb-1 opacity-50" />}
                  <span className="text-xs font-medium">Eligibility</span>
                </div>
                <div className={`p-2 rounded flex flex-col items-center justify-center text-center border ${hasNeed ? 'bg-green-50 border-green-200 text-green-700' : 'bg-secondary border-border text-muted-foreground'}`}>
                  {hasNeed ? <CheckCircle2 className="w-5 h-5 mb-1" /> : <Clock className="w-5 h-5 mb-1 opacity-50" />}
                  <span className="text-xs font-medium">Need</span>
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
                  <p className="font-medium">{claim.account.name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Type</span>
                  <p className="font-medium capitalize">{claim.account.type}</p>
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
                    <Link href={`/items/${claim.item.id}`} className="hover:underline hover:text-primary">
                      {claim.item.name}
                    </Link>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Item ID</span>
                  <p className="font-mono text-sm">{claim.item.itemId}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Current Stage</span>
                  <p className="font-medium capitalize">{claim.item.stage}</p>
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
                Status History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-border ml-3 space-y-6">
                {claim.history.map((entry, index) => {
                  const isLatest = index === claim.history.length - 1;
                  return (
                    <div key={entry.id} className="pl-6 relative">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${isLatest ? 'bg-primary ring-2 ring-primary/20' : 'bg-muted-foreground/30'}`} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm capitalize">{entry.toStatus}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(entry.timestamp || new Date()), 'MMM d, h:mm a')}</span>
                        </div>
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

      <Dialog open={isEvidenceOpen} onOpenChange={setIsEvidenceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Evidence</DialogTitle>
            <DialogDescription>Submit documentation supporting this claim.</DialogDescription>
          </DialogHeader>
          <Form {...evidenceForm}>
            <form onSubmit={evidenceForm.handleSubmit(onEvidenceSubmit)} className="space-y-4 py-4">
              <FormField
                control={evidenceForm.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evidence Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="identity">Identity Verification</SelectItem>
                        <SelectItem value="eligibility">Eligibility Check</SelectItem>
                        <SelectItem value="need">Assessment of Need</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={evidenceForm.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference ID / Document Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. DL-12345 or Intake Form #8" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={evidenceForm.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Details about what was verified..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEvidenceOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addEvidence.isPending}>
                  {addEvidence.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Add Evidence
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVerifyOpen} onOpenChange={setIsVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Claim</DialogTitle>
            <DialogDescription>
              Mark this claim as verified. All required evidence has been submitted.
              It will be forwarded to a supervisor for final approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsVerifyOpen(false)}>Cancel</Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white" 
              onClick={() => handleStatusChange('verified', setIsVerifyOpen)}
              disabled={transitionClaim.isPending}
            >
              {transitionClaim.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Claim</DialogTitle>
            <DialogDescription>
              As a supervisor, you are authorizing this claim for transfer. 
              Are you sure you want to approve it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsApproveOpen(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={() => handleStatusChange('approved', setIsApproveOpen)}
              disabled={transitionClaim.isPending}
            >
              {transitionClaim.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Approve Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Transfer</DialogTitle>
            <DialogDescription>
              Create a transfer record to move this item to the recipient.
              This begins the formal chain of custody release.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={handleCreateTransfer}
              disabled={createTransfer.isPending}
            >
              {createTransfer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Transfer Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Claim</DialogTitle>
            <DialogDescription>
              This will reject the claim. Please provide a reason for the rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button 
              className="bg-red-600 hover:bg-red-700 text-white" 
              onClick={() => handleStatusChange('rejected', setIsRejectOpen)}
              disabled={transitionClaim.isPending}
            >
              {transitionClaim.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reject Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Claim</DialogTitle>
            <DialogDescription>
              This will cancel the claim entirely. This action cannot be undone.
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
              disabled={transitionClaim.isPending}
            >
              {transitionClaim.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Cancel Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
