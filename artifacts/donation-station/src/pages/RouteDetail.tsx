import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetRoute, getGetRouteQueryKey, useUpdateRoute, DeliveryRouteUpdateStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, Truck, MapPin, Calendar, CheckCircle2, Clock, Navigation, 
  Package, FileText, Loader2, ClipboardCheck, Pencil
} from 'lucide-react';
import { format } from 'date-fns';
import { TierBadge } from '@/components/shared';

export default function RouteDetail() {
  const [, params] = useRoute('/routes/:id');
  const id = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: route, isLoading, isError } = useGetRoute(id, { 
    query: { enabled: !!id, queryKey: getGetRouteQueryKey(id) } 
  });
  
  const updateRoute = useUpdateRoute();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editRoute, setEditRoute] = useState({ name: '', date: '', notes: '' });

  useEffect(() => {
    if (route) {
      setEditRoute({
        name: route.name,
        date: route.date.slice(0, 10),
        notes: route.notes ?? '',
      });
    }
  }, [route]);

  const handleStatusChange = (newStatus: DeliveryRouteUpdateStatus) => {
    updateRoute.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
        toast({ title: 'Status updated', description: `Route is now ${newStatus.replace('_', ' ')}` });
      },
      onError: (err: any) => {
        toast({ title: 'Error', description: err.message || 'Failed to update status', variant: 'destructive' });
      }
    });
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (open && route) {
      setEditRoute({
        name: route.name,
        date: route.date.slice(0, 10),
        notes: route.notes ?? '',
      });
    }
  };

  const handleRouteDetailsUpdate = () => {
    const name = editRoute.name.trim();
    if (!name || !editRoute.date) {
      toast({
        title: 'Missing fields',
        description: 'Route name and date are required.',
        variant: 'destructive',
      });
      return;
    }

    updateRoute.mutate({
      id,
      data: {
        name,
        date: editRoute.date,
        notes: editRoute.notes,
      },
    }, {
      onSuccess: () => {
        setIsEditDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
        toast({ title: 'Route updated', description: 'Route details saved successfully.' });
      },
      onError: (err: any) => {
        toast({
          title: 'Error',
          description: err.message || 'Failed to update route',
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !route) {
    return (
      <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">Route Not Found</h2>
        <p className="mb-6">The route you are looking for does not exist.</p>
        <Link href="/routes">
          <Button variant="outline">Back to Routes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/routes">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" />
              {route.name}
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(route.date), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" onClick={() => handleEditDialogChange(true)} disabled={updateRoute.isPending}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit Route
          </Button>
          <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-border shadow-sm">
            <span className="text-sm font-semibold text-muted-foreground uppercase pl-2">Status</span>
            <Select
              value={route.status}
              onValueChange={(v) => handleStatusChange(v as DeliveryRouteUpdateStatus)}
              disabled={updateRoute.isPending}
            >
              <SelectTrigger className={`w-40 border-0 ${
                route.status === 'completed' ? 'bg-green-50 text-green-700' :
                route.status === 'in_progress' ? 'bg-amber-50 text-amber-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                {updateRoute.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Planned</div>
                </SelectItem>
                <SelectItem value="in_progress">
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> In Progress</div>
                </SelectItem>
                <SelectItem value="completed">
                  <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Delivery Route</DialogTitle>
            <DialogDescription>Update the route name, scheduled date, or notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-route-name">Route Name</Label>
              <Input
                id="edit-route-name"
                placeholder="e.g. Downtown Shelters Run"
                value={editRoute.name}
                onChange={(event) => setEditRoute((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-route-date">Scheduled Date</Label>
              <Input
                id="edit-route-date"
                type="date"
                value={editRoute.date}
                onChange={(event) => setEditRoute((current) => ({ ...current, date: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-route-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-route-notes"
                placeholder="Driver info, vehicle assignment..."
                value={editRoute.notes}
                onChange={(event) => setEditRoute((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRouteDetailsUpdate} disabled={updateRoute.isPending}>
              {updateRoute.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {route.notes && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex gap-3 text-sm">
          <FileText className="w-5 h-5 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold block mb-1">Route Notes</span>
            {route.notes}
          </div>
        </div>
      )}

      <Card className="shadow-sm border-border overflow-hidden">
        <CardHeader className="bg-secondary/30 border-b border-border/50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="w-5 h-5" />
            Manifest & Stops
          </CardTitle>
          <CardDescription>
            {route.stops.length} {route.stops.length === 1 ? 'stop' : 'stops'} scheduled for this route.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-0">
          {route.stops.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <MapPin className="w-10 h-10 mb-3 opacity-20" />
              <p>No stops have been added to this route yet.</p>
              <p className="text-sm">In a complete implementation, you would add items from the inventory.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {/* Sort stops by stopOrder */}
              {[...route.stops].sort((a, b) => a.stopOrder - b.stopOrder).map((stop, index) => (
                <div
                  key={stop.itemId ?? stop.pickupRequestId ?? `stop-${stop.stopOrder}`}
                  className="flex items-stretch group hover:bg-secondary/20 transition-colors"
                >
                  <div className="w-12 md:w-16 shrink-0 flex flex-col items-center py-4 border-r border-border/50 bg-secondary/10">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm ring-2 ring-white">
                      {stop.stopOrder}
                    </div>
                    {index < route.stops.length - 1 && (
                      <div className="flex-1 w-0.5 bg-border mt-2" />
                    )}
                  </div>
                  
                  <div className="flex-1 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                       <div className="hidden md:flex mt-1">
                         {stop.item ? <Package className="w-5 h-5 text-muted-foreground" /> : <ClipboardCheck className="w-5 h-5 text-primary" />}
                       </div>
                      <div>
                         {stop.item ? (
                           <>
                             <div className="flex items-center gap-2 mb-1">
                               <Link href={`/items/${stop.item.id}`} className="font-bold text-lg hover:text-primary hover:underline">
                                 {stop.item.name}
                               </Link>
                               <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                                 {stop.item.itemId}
                               </span>
                             </div>
                             <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                               <TierBadge tier={stop.item.tier} />
                               <span>•</span>
                               <span>Recipient: <span className="font-medium text-foreground">{stop.item.recipient || 'Not specified'}</span></span>
                             </div>
                           </>
                         ) : stop.pickup ? (
                           <>
                             <div className="flex items-center gap-2 mb-1">
                               <span className="font-bold text-lg">Pickup: {stop.pickup.name || stop.pickup.phone}</span>
                               <Badge className="capitalize bg-primary/10 text-primary border-0">{stop.pickup.status.replaceAll('_', ' ')}</Badge>
                             </div>
                             <div className="text-sm text-muted-foreground mb-2">
                               {stop.pickup.address}
                               {stop.pickup.itemsDescribed ? <span> • {stop.pickup.itemsDescribed}</span> : null}
                             </div>
                           </>
                         ) : (
                           <p className="font-medium text-muted-foreground">Unavailable stop details</p>
                         )}
                        
                        {stop.notes && (
                          <div className="text-sm bg-white border border-border p-2 rounded italic text-muted-foreground mt-2">
                            Stop Note: {stop.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="shrink-0 flex items-center gap-4">
                       <div className="text-right hidden md:block">
                         <div className="text-xs text-muted-foreground">{stop.item ? 'Location' : 'Pickup window'}</div>
                         <div className="font-medium text-sm">{stop.item?.location || stop.pickup?.requestedWindow || 'Unknown'}</div>
                       </div>
                       {stop.item ? (
                         <Link href={`/items/${stop.item.id}`}>
                           <Button variant="outline" size="sm">View Item</Button>
                         </Link>
                       ) : stop.pickup ? (
                         <Link href="/pickups">
                           <Button variant="outline" size="sm">View Pickup</Button>
                         </Link>
                       ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}