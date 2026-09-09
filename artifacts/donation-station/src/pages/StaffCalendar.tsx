import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin, Search, Filter, Loader2, ArrowRight, Package, User, Hash } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

type ServiceActivity = {
  id: string;
  activityType: string;
  appointmentType?: string;
  loopStage: string;
  status: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  locationId?: string;
  staffOwner?: string;
  publicSafeSummary?: string;
  relatedAppointmentId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pickupAddress?: string;
  relatedClaimId?: string;
  relatedItemId?: string;
  internalNotes?: string;
};

const labels: Record<string, string> = {
  donation_dropoff: 'Donation Drop-off',
  donation_pickup: 'Donation Pickup',
  receiver_pickup: 'Receiver Pickup Window',
  reserve_item_pickup: 'Reserve Item Pickup',
  volunteer_shift: 'Volunteer Shift',
  donation_market: 'Donation Market Window',
  barter_handoff: 'Future Barter Handoff',
  escrow_dropoff: 'Station Escrow Drop-off',
  escrow_pickup: 'Station Escrow Pickup'
};

const statusColors: Record<string, string> = {
  requested: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  in_progress: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  completed: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
  canceled: 'bg-destructive/10 text-destructive border-destructive/20',
  no_show: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
};

export default function StaffCalendar() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [date, setDate] = useState('');
  const [staffOwner, setStaffOwner] = useState('');
  const [related, setRelated] = useState('');
  const client = useQueryClient();
  
  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (type !== 'all') query.set('activityType', type);
  query.set('scheduled', 'true');
  if (staffOwner.trim()) query.set('staffOwner', staffOwner.trim());
  if (related.trim().startsWith('claim:')) query.set('relatedClaimId', related.trim().slice(6));
  if (related.trim().startsWith('item:')) query.set('relatedItemId', related.trim().slice(5));
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);
    query.set('start', start.toISOString());
    query.set('end', end.toISOString());
  }
  
  const { data = [], isLoading } = useQuery<ServiceActivity[]>({
    queryKey: ['service-activities', status, type, date, staffOwner, related],
    queryFn: () => customFetch(`/api/service-activities?${query}`, { responseType: 'json' })
  });

  const update = useMutation({
    mutationFn: ({ id, next, reason }: { id: string; next: string; reason?: string }) => customFetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      responseType: 'json',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: next,
        reason,
      })
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['service-activities'] }),
  });
  const linkClaim = useMutation({
    mutationFn: (id: string) => customFetch(`/api/appointments/${id}/link-claim`, {
      method: 'PATCH',
      responseType: 'json',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['service-activities'] }),
  });

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Service Loop Calendar</h1>
          <p className="text-sm font-medium text-muted-foreground mt-2">Operational awareness for bookings, reservations, pickups, and shifts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1.5 font-bold tracking-wide shadow-sm">
            {data.length} {data.length === 1 ? 'Appointment' : 'Appointments'}
          </Badge>
        </div>
      </header>
      
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 bg-card p-5 rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2">
          <Filter className="w-4 h-4" />
          Filter Loop
        </div>
        
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-[240px] bg-background font-medium">
            <SelectValue placeholder="Appointment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-bold">All appointment types</SelectItem>
            {['appointment','item_reservation','distribution','volunteer_shift','pickup','dropoff','barter_handoff'].map(value => (
              <SelectItem key={value} value={value} className="font-medium">{value === 'barter_handoff' ? 'Future Barter Handoff' : value.replaceAll('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={event => setDate(event.target.value)} className="w-full sm:w-44 bg-background font-medium" aria-label="Filter by date" />
        <Input value={staffOwner} onChange={event => setStaffOwner(event.target.value)} placeholder="Staff owner..." className="w-full sm:w-44 bg-background font-medium" />
        <Input value={related} onChange={event => setRelated(event.target.value)} placeholder="claim:ID or item:ID..." className="w-full sm:w-56 bg-background font-medium font-mono text-sm" />
        
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[180px] bg-background font-medium">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-bold">All statuses</SelectItem>
            {['requested','confirmed','in_progress','completed','canceled','no_show'].map(value => (
              <SelectItem key={value} value={value} className="capitalize font-medium">
                {value.replace('_',' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="font-bold tracking-wide">Syncing calendar...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-24 text-muted-foreground shadow-sm">
          <CalendarDays className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-xl font-bold text-foreground">No appointments found</p>
          <p className="text-sm font-medium mt-2">Try changing your filters to see more results.</p>
          {(status !== 'all' || type !== 'all') && (
            <Button 
              variant="outline" 
              className="mt-6 font-bold"
              onClick={() => { setStatus('all'); setType('all'); }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(appointment => (
            <Card key={appointment.id} className="overflow-hidden shadow-sm hover-elevate border-border transition-all">
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-[minmax(280px,2fr)_minmax(220px,1.5fr)_minmax(220px,1.5fr)_auto] divide-y lg:divide-y-0 lg:divide-x divide-border/50">
                  
                  {/* Column 1: Time & Type */}
                  <div className="p-6 flex flex-col justify-center bg-muted/10">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge variant="outline" className={`capitalize font-bold tracking-wide ${statusColors[appointment.status] || ''}`}>
                        {appointment.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-[10px] font-bold text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded border border-border/50">
                        {appointment.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-bold text-lg text-foreground mb-2 leading-tight">
                      {labels[appointment.appointmentType ?? ''] ?? appointment.activityType.replaceAll('_', ' ')}
                    </h3>
                    <div className="space-y-2 mt-1">
                      <p className="flex items-center gap-2 text-sm text-foreground font-semibold">
                        <Clock className="w-4 h-4 text-primary" />
                        {appointment.scheduledStart ? format(new Date(appointment.scheduledStart), 'MMM d, h:mm a') : 'Unscheduled'}
                        {appointment.scheduledEnd ? ` – ${format(new Date(appointment.scheduledEnd), 'h:mm a')}` : ''}
                      </p>
                      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0" />
                        {appointment.locationId ? `Station ${appointment.locationId}` : `Owner: ${appointment.staffOwner || 'Unassigned'}`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Column 2: Contact Info */}
                  <div className="p-6 flex flex-col justify-center space-y-3 bg-card">
                    <div className="flex items-start gap-3">
                      <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-bold text-foreground">{appointment.contactName || 'No name provided'}</p>
                        {appointment.contactEmail && <p className="text-muted-foreground font-medium mt-0.5">{appointment.contactEmail}</p>}
                        {appointment.contactPhone && <p className="text-muted-foreground font-medium mt-0.5">{appointment.contactPhone}</p>}
                      </div>
                    </div>
                    {appointment.pickupAddress && (
                      <div className="mt-3 text-sm bg-muted/30 p-3 rounded-lg border border-border/50 shadow-inner">
                        <span className="font-bold block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Private Pickup</span>
                        <span className="font-medium text-foreground">{appointment.pickupAddress}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Column 3: Relations & Notes */}
                  <div className="p-6 flex flex-col justify-center space-y-4 bg-card">
                    {(appointment.relatedClaimId || appointment.relatedItemId) ? (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Related Entities</p>
                        <div className="flex flex-wrap gap-2">
                          {appointment.relatedClaimId && (
                            <Button variant="outline" size="sm" className="h-8 text-xs font-bold bg-background shadow-sm hover:border-primary/50 hover:text-primary" asChild>
                              <a href={`/claims/${appointment.relatedClaimId}`}>
                                <Hash className="w-3 h-3 mr-1.5 opacity-70" />
                                Claim
                                <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
                              </a>
                            </Button>
                          )}
                          {appointment.relatedItemId && (
                            <Button variant="outline" size="sm" className="h-8 text-xs font-bold bg-background shadow-sm hover:border-primary/50 hover:text-primary" asChild>
                              <a href={`/items/${appointment.relatedItemId}`}>
                                <Package className="w-3 h-3 mr-1.5 opacity-70" />
                                Item
                                <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-muted-foreground/60 italic border border-dashed border-border/50 rounded-lg p-3 text-center">
                        No related claims or items
                      </div>
                    )}
                  </div>
                  
                  {/* Column 4: Actions */}
                  <div className="p-6 flex items-center justify-center lg:justify-end bg-muted/10">
                    <div className="w-full lg:w-48 flex flex-col gap-3">
                      {appointment.appointmentType === 'reserve_item_pickup' && appointment.relatedAppointmentId && !appointment.relatedClaimId && (
                        <Button size="sm" className="w-full font-bold shadow-sm" onClick={() => linkClaim.mutate(appointment.relatedAppointmentId!)} disabled={linkClaim.isPending}>
                          Link approved claim
                        </Button>
                      )}
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update Status</Label>
                      {appointment.relatedAppointmentId ? <Select 
                        value={appointment.status} 
                        onValueChange={(next) => {
                          if (next === appointment.status) return;
                          let reason: string | undefined;
                          if (next === 'canceled' || next === 'no_show') {
                            reason = window.prompt(`Reason for ${next.replace('_', ' ')}`)?.trim();
                            if (!reason) return;
                          }
                          update.mutate({ id: appointment.relatedAppointmentId!, next, reason });
                        }}
                        disabled={update.isPending}
                      >
                        <SelectTrigger className="w-full font-bold h-10 bg-card shadow-sm border-border/80 focus:ring-primary">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['requested','confirmed','in_progress','completed','canceled','no_show'].map(value => (
                            <SelectItem key={value} value={value} className="capitalize font-medium">
                              {value.replace('_',' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select> : <p className="text-xs font-medium text-muted-foreground bg-card p-2 rounded border border-border/50">{appointment.publicSafeSummary || appointment.loopStage}</p>}
                      {update.isPending && <p className="text-[10px] uppercase tracking-widest font-bold text-center text-primary animate-pulse">Saving changes...</p>}
                    </div>
                  </div>
                  
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
