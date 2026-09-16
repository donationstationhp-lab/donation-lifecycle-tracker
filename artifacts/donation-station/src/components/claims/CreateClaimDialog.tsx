import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateClaim, useCreateAccount, getListClaimsQueryKey, getListAccountsQueryKey, RecipientAccount, DonationItem } from '@workspace/api-client-react';
import { Loader2, Plus, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

const claimSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  itemId: z.string().min(1, 'Item is required'),
  notes: z.string().optional(),
});

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  contactName: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
});

type ClaimValues = z.infer<typeof claimSchema>;
type AccountValues = z.infer<typeof accountSchema>;

export function CreateClaimDialog({ 
  open, 
  onOpenChange, 
  accounts, 
  items 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  accounts: RecipientAccount[];
  items: DonationItem[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const createClaim = useCreateClaim();
  const createAccount = useCreateAccount();

  const [view, setView] = useState<'claim' | 'account'>('claim');

  const claimForm = useForm<ClaimValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: { accountId: '', itemId: '', notes: '' },
  });

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: '', type: 'individual', contactName: '', contactEmail: '', contactPhone: '' },
  });

  const onClaimSubmit = (data: ClaimValues) => {
    createClaim.mutate({ data }, {
      onSuccess: (newClaim) => {
        toast({ title: 'Claim created successfully' });
        queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey() });
        onOpenChange(false);
        claimForm.reset();
        setLocation(`/claims/${newClaim.id}`);
      },
      onError: (err: any) => {
        toast({ title: 'Error creating claim', description: err.message, variant: 'destructive' });
      }
    });
  };

  const onAccountSubmit = (data: AccountValues) => {
    createAccount.mutate({ 
      data: {
        ...data,
        contactEmail: data.contactEmail || undefined,
      } 
    }, {
      onSuccess: (newAccount) => {
        toast({ title: 'Account created successfully' });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        claimForm.setValue('accountId', newAccount.id);
        setView('claim');
        accountForm.reset();
      },
      onError: (err: any) => {
        toast({ title: 'Error creating account', description: err.message, variant: 'destructive' });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {view === 'claim' ? (
          <>
            <DialogHeader>
              <DialogTitle>Create New Claim</DialogTitle>
              <DialogDescription>
                Assign an item to an account to start the verification process.
              </DialogDescription>
            </DialogHeader>

            <Form {...claimForm}>
              <form onSubmit={claimForm.handleSubmit(onClaimSubmit)} className="space-y-4 py-4">
                <FormField
                  control={claimForm.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Account</FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select an account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {accounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.name} ({acc.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon" onClick={() => setView('account')}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={claimForm.control}
                  name="itemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {items.filter(i => i.stage === 'storage' || i.stage === 'qc').map(item => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.itemId} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={claimForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any initial notes about this claim..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={createClaim.isPending}>
                    {createClaim.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Claim
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8" onClick={() => setView('claim')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Create Recipient Account
              </DialogTitle>
              <DialogDescription>
                Add a new individual or organization to claim items.
              </DialogDescription>
            </DialogHeader>

            <Form {...accountForm}>
              <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4 py-4">
                <FormField
                  control={accountForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe or Org Name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={accountForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="organization">Organization</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={accountForm.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={accountForm.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={accountForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setView('claim')}>Cancel</Button>
                  <Button type="submit" disabled={createAccount.isPending}>
                    {createAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
