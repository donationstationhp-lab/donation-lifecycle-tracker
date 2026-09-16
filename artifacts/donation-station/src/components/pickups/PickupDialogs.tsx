import React, { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useCreatePickup,
  useLogPickupContactAttempt,
  useAssignPickupRoute,
  useRecordPickupOutcome,
  useCompletePickup,
  useCreatePickupFlag,
  useUpdateConfirmationTemplate,
  useGetConfirmationTemplate,
  getGetConfirmationTemplateQueryKey,
  useListRoutes,
  getListRoutesQueryKey,
  getGetPickupQueryKey,
  getListPickupsQueryKey,
  PickupOutcome,
  PickupCompleteInputCondition,
  PickupContactAttemptInputResult,
  PickupFlagType,
  PickupAddressType
} from '@workspace/api-client-react';

/* -------------------------------------------------------------------------- */
/* Create Pickup Dialog                                                       */
/* -------------------------------------------------------------------------- */
const createPickupSchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  name: z.string().optional(),
  address: z.string().min(1, 'Address is required'),
  addressType: z.enum(['residence', 'business', 'other']).default('residence'),
  requestedWindow: z.string().min(1, 'Requested window is required'),
  itemsDescribed: z.string().optional(),
});

export function CreatePickupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof createPickupSchema>>({
    resolver: zodResolver(createPickupSchema),
    defaultValues: { phone: '', name: '', address: '', addressType: 'residence', requestedWindow: '', itemsDescribed: '' },
  });

  const createPickup = useCreatePickup({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Pickup request created' });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        form.reset();
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Error', description: err.error || 'Failed to create pickup' });
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Pickup Request</DialogTitle>
          <DialogDescription>Manually create a pickup request (donor side bypass).</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => createPickup.mutate({ data: data as any }))} className="space-y-4">
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Name (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="addressType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residence">Residence</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="requestedWindow" render={({ field }) => (
                <FormItem><FormLabel>Requested Window</FormLabel><FormControl><Input placeholder="e.g. Next Wed Morning" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="itemsDescribed" render={({ field }) => (
              <FormItem><FormLabel>Items Described</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createPickup.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Log Contact Dialog                                                         */
/* -------------------------------------------------------------------------- */
const contactSchema = z.object({
  result: z.enum(['contacted', 'no_response']),
  notes: z.string().optional(),
});

export function LogContactDialog({ pickupId, open, onOpenChange }: { pickupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { result: 'contacted', notes: '' },
  });

  const logContact = useLogPickupContactAttempt({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Contact attempt logged' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        form.reset();
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Contact Attempt</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => logContact.mutate({ id: pickupId, data: data as any }))} className="space-y-4">
            <FormField control={form.control} name="result" render={({ field }) => (
              <FormItem>
                <FormLabel>Result</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="contacted">Contacted successfully</SelectItem>
                    <SelectItem value="no_response">No response</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={logContact.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Assign Route Dialog                                                        */
/* -------------------------------------------------------------------------- */
const routeSchema = z.object({
  linkedRouteId: z.string().min(1, 'Route is required'),
  assignedDriver: z.string().optional(),
});

export function AssignRouteDialog({ pickupId, open, onOpenChange }: { pickupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof routeSchema>>({
    resolver: zodResolver(routeSchema),
    defaultValues: { linkedRouteId: '', assignedDriver: '' },
  });

  const { data: routes } = useListRoutes({ query: { enabled: open, queryKey: getListRoutesQueryKey() } });
  
  const assignRoute = useAssignPickupRoute({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Route assigned' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        form.reset();
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Route</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => assignRoute.mutate({ id: pickupId, data }))} className="space-y-4">
            <FormField control={form.control} name="linkedRouteId" render={({ field }) => (
              <FormItem>
                <FormLabel>Route</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select Route" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {routes?.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({new Date(r.date).toLocaleDateString()})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="assignedDriver" render={({ field }) => (
              <FormItem><FormLabel>Driver Name (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={assignRoute.isPending}>Assign</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Outcome Dialog                                                             */
/* -------------------------------------------------------------------------- */
const outcomeSchema = z.object({
  outcome: z.enum(['completed', 'no_show', 'false_address', 'cancelled', 'flagged']),
  notes: z.string().optional(),
});

export function OutcomeDialog({ pickupId, open, onOpenChange }: { pickupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof outcomeSchema>>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: { outcome: 'completed', notes: '' },
  });

  const recordOutcome = useRecordPickupOutcome({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Outcome recorded' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        form.reset();
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Outcome</DialogTitle>
          <DialogDescription>Mark the final status of this pickup attempt.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => recordOutcome.mutate({ id: pickupId, data: data as any }))} className="space-y-4">
            <FormField control={form.control} name="outcome" render={({ field }) => (
              <FormItem>
                <FormLabel>Outcome</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                    <SelectItem value="false_address">False Address</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={recordOutcome.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Complete Pickup (Intake) Dialog                                            */
/* -------------------------------------------------------------------------- */
const completeSchema = z.object({
  itemsReceived: z.string().min(1, 'Description required'),
  condition: z.enum(['good', 'fair', 'poor']).default('good'),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export function CompletePickupDialog({ pickupId, open, onOpenChange }: { pickupId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof completeSchema>>({
    resolver: zodResolver(completeSchema),
    defaultValues: { itemsReceived: '', condition: 'good', category: 'General', notes: '' },
  });

  const completePickup = useCompletePickup({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Pickup completed & Item generated' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        form.reset();
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Pickup & Intake</DialogTitle>
          <DialogDescription>Convert this successful pickup into an inventory item.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => completePickup.mutate({ id: pickupId, data: data as any }))} className="space-y-4">
            <FormField control={form.control} name="itemsReceived" render={({ field }) => (
              <FormItem><FormLabel>Items Received Summary</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="condition" render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Intake Notes</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={completePickup.isPending}>Complete & Intake</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Flag Pickup Dialog                                                         */
/* -------------------------------------------------------------------------- */
const flagSchema = z.object({
  type: z.enum(['phone', 'address']),
  value: z.string().min(1, 'Value required'),
  reason: z.string().min(1, 'Reason required'),
});

export function FlagPickupDialog({ pickupId, open, onOpenChange, defaultValue, defaultType }: { pickupId: string; open: boolean; onOpenChange: (o: boolean) => void; defaultValue?: string; defaultType?: 'phone' | 'address' }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof flagSchema>>({
    resolver: zodResolver(flagSchema),
    defaultValues: { type: defaultType || 'address', value: defaultValue || '', reason: '' },
  });

  // Update defaults when props change
  useEffect(() => {
    if (open) {
      form.reset({ type: defaultType || 'address', value: defaultValue || '', reason: '' });
    }
  }, [open, defaultType, defaultValue, form]);

  const flagPickup = useCreatePickupFlag({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Flag submitted for supervisor review' });
        queryClient.invalidateQueries({ queryKey: getGetPickupQueryKey(pickupId) });
        queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag Pickup Issue</DialogTitle>
          <DialogDescription>Report a fake address, scam phone, or other issue.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => flagPickup.mutate({ id: pickupId, data: data as any }))} className="space-y-4">
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Flag Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="phone">Phone Number</SelectItem>
                    <SelectItem value="address">Address</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="value" render={({ field }) => (
              <FormItem><FormLabel>Value to Flag</FormLabel><FormControl><Input {...field} readOnly={!!defaultValue} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem><FormLabel>Reason</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={flagPickup.isPending}>Submit Flag</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation Template Dialog                                               */
/* -------------------------------------------------------------------------- */
const templateSchema = z.object({
  body: z.string().min(1, 'Template body is required'),
});

export function ConfirmationTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema),
    defaultValues: { body: '' },
  });

  const { data: template, isSuccess } = useGetConfirmationTemplate({ query: { enabled: open, queryKey: getGetConfirmationTemplateQueryKey() } });
  
  const initRef = useRef(false);
  useEffect(() => {
    if (isSuccess && template && !initRef.current) {
      form.reset({ body: template.body });
      initRef.current = true;
    }
    if (!open) {
      initRef.current = false;
    }
  }, [isSuccess, template, open, form]);

  const updateTemplate = useUpdateConfirmationTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Template updated' });
        queryClient.invalidateQueries({ queryKey: getGetConfirmationTemplateQueryKey() });
        onOpenChange(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Confirmation SMS Template</DialogTitle>
          <DialogDescription>This message is sent to donors when their pickup is verified.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => updateTemplate.mutate({ data }))} className="space-y-4">
            <FormField control={form.control} name="body" render={({ field }) => (
              <FormItem>
                <FormLabel>Message Body</FormLabel>
                <FormControl><Textarea className="h-32" {...field} /></FormControl>
                <p className="text-xs text-muted-foreground">Available variables: {'{name}, {window}, {address}'}</p>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateTemplate.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
