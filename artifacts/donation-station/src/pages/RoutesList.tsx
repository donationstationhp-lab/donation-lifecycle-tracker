import { useState } from 'react';
import { useListRoutes, useCreateRoute } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Truck, Calendar, MapPin, Plus, Loader2, Navigation, CheckCircle2, Clock } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function RoutesList() {
  const { data: routes, isLoading, isError } = useListRoutes();
  const createRoute = useCreateRoute();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newRoute, setNewRoute] = useState({ name: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });

  const handleCreateRoute = () => {
    if (!newRoute.name || !newRoute.date) {
      toast({ title: 'Missing fields', description: 'Name and date are required.', variant: 'destructive' });
      return;
    }

    createRoute.mutate({ data: { ...newRoute, stops: [] } }, {
      onSuccess: () => {
        setIsNewDialogOpen(false);
        setNewRoute({ name: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
        queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
        toast({ title: 'Route created', description: 'New delivery route added successfully.' });
      },
      onError: (err: any) => {
        toast({ title: 'Error', description: err.message || 'Failed to create route', variant: 'destructive' });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Calendar className="w-3 h-3 mr-1"/> Planned</Badge>;
      case 'in_progress': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1"/> In Progress</Badge>;
      case 'completed': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Delivery Routes</h1>
          <p className="text-muted-foreground text-sm">Manage dispatch and distribution paths</p>
        </div>
        
        <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              New Route
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Delivery Route</DialogTitle>
              <DialogDescription>Plan a new distribution route.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Route Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Downtown Shelters Run" 
                  value={newRoute.name}
                  onChange={e => setNewRoute(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Scheduled Date</Label>
                <Input 
                  id="date" 
                  type="date"
                  value={newRoute.date}
                  onChange={e => setNewRoute(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Driver info, vehicle assignment..."
                  value={newRoute.notes}
                  onChange={e => setNewRoute(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateRoute} disabled={createRoute.isPending}>
                {createRoute.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Route
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
          Failed to load delivery routes.
        </div>
      )}

      {!isLoading && !isError && routes?.length === 0 && (
        <div className="p-12 text-center bg-secondary/30 rounded-xl border border-dashed border-border flex flex-col items-center">
          <Navigation className="w-12 h-12 mb-4 text-muted-foreground opacity-20" />
          <h3 className="text-lg font-medium text-foreground">No routes planned</h3>
          <p className="text-muted-foreground text-sm mt-1">Create a new route to start scheduling deliveries.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {routes?.map(route => (
          <Link key={route.id} href={`/routes/${route.id}`}>
            <Card className="shadow-sm hover-elevate cursor-pointer h-full border-border">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Truck className="w-5 h-5" />
                  </div>
                  {getStatusBadge(route.status)}
                </div>
                
                <h3 className="font-bold text-lg leading-tight mb-1">{route.name}</h3>
                
                <div className="text-sm text-muted-foreground flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(route.date), 'EEEE, MMM d, yyyy')}
                </div>
                
                <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {route.stopCount} {route.stopCount === 1 ? 'Stop' : 'Stops'}
                  </div>
                  {route.notes && (
                    <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={route.notes}>
                      {route.notes}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}