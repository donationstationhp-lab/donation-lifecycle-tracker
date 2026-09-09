import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin, Search, Filter, Loader2, ArrowRight, Package, User, Hash } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

type Appointment = {
  id: string;
  appointmentType: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  locationId: string;
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
  barter_handoff: 'Barter Handoff',
  escrow_dropoff: 'Station Escrow Drop-off',
  escrow_pickup: 'Station Escrow Pickup'
};

const statusColors: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
  in_progress: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100',
  completed: 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-100',
  canceled: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100',
  no_show: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100'
};

export default function StaffCalendar() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const client = useQueryClient();
  
  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (type !== 'all') query.set('appointmentType', type);
  
  const { data = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ['appointments', status, type],
    queryFn: () => customFetch(`/api/appointments?${query}`, { responseType: 'json' })
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
    onSuccess: () => client.invalidateQueries({ queryKey: ['appointments'] }),
  });
  const linkClaim = useMutation({
    mutationFn: (id: string) => customFetch(`/api/appointments/${id}/link-claim`, {
      method: 'PATCH',
      responseType: 'json',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Calendar</h1>
          <p className="text-muted-foreground mt-1">Operational awareness for bookings, reservations, pickups, and shifts.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick stats could go here */}
          <Badge variant="secondary" className="px-3 py-1">
            {data.length} {data.length === 1 ? 'appointment' : 'appointments'}
          </Badge>
        </div>
      </header>
      
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-2">
          <Filter className="w-4 h-4" />
          Filter
        </div>
        
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-[240px] bg-background">
            <SelectValue placeholder="Appointment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All appointment types</SelectItem>
            {Object.entries(labels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[180px] bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {['requested','confirmed','in_progress','completed','canceled','no_show'].map(value => (
              <SelectItem key={value} value={value} className="capitalize">
                {value.replace('_',' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p>Loading calendar...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card rounded-lg border border-dashed flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarDays className="w-10 h-10 mb-4 opacity-50" />
          <p className="text-lg font-medium text-foreground">No appointments found</p>
          <p className="text-sm mt-1">Try changing your filters to see more results.</p>
          {(status !== 'all' || type !== 'all') && (
            <Button 
              variant="outline" 
              className="mt-4" 
              onClick={() => { setStatus('all'); setType('all'); }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(appointment => (
            <Card key={appointment.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-[minmax(250px,2fr)_minmax(200px,1.5fr)_minmax(200px,1.5fr)_auto] divide-y lg:divide-y-0 lg:divide-x border-border">
                  
                  {/* Column 1: Time & Type */}
                  <div className="p-5 flex flex-col justify-center bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={`capitalize shadow-sm ${statusColors[appointment.status] || ''}`}>
                        {appointment.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-full">
                        {appointment.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-base mb-1">
                      {labels[appointment.appointmentType] ?? appointment.appointmentType}
                    </h3>
                    <div className="space-y-1 mt-2">
                      <p className="flex items-center gap-2 text-sm text-foreground font-medium">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {format(new Date(appointment.scheduledStart), 'MMM d, h:mm a')} – {format(new Date(appointment.scheduledEnd), 'h:mm a')}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0" />
                        Station {appointment.locationId}
                      </p>
                    </div>
                  </div>
                  
                  {/* Column 2: Contact Info */}
                  <div className="p-5 flex flex-col justify-center space-y-2">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-foreground">{appointment.contactName || 'No name provided'}</p>
                        {appointment.contactEmail && <p className="text-muted-foreground">{appointment.contactEmail}</p>}
                        {appointment.contactPhone && <p className="text-muted-foreground">{appointment.contactPhone}</p>}
                      </div>
                    </div>
                    {appointment.pickupAddress && (
                      <div className="mt-2 text-sm bg-muted/50 p-2 rounded-md border border-border">
                        <span className="font-medium block text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Private Pickup</span>
                        {appointment.pickupAddress}
                      </div>
                    )}
                  </div>
                  
                  {/* Column 3: Relations & Notes */}
                  <div className="p-5 flex flex-col justify-center space-y-3">
                    {(appointment.relatedClaimId || appointment.relatedItemId) ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Related Entities</p>
                        <div className="flex flex-wrap gap-2">
                          {appointment.relatedClaimId && (
                            <Button variant="outline" size="sm" className="h-7 text-xs bg-background" asChild>
                              <a href={`/claims/${appointment.relatedClaimId}`}>
                                <Hash className="w-3 h-3 mr-1" />
                                Claim
                                <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
                              </a>
                            </Button>
                          )}
                          {appointment.relatedItemId && (
                            <Button variant="outline" size="sm" className="h-7 text-xs bg-background" asChild>
                              <a href={`/items/${appointment.relatedItemId}`}>
                                <Package className="w-3 h-3 mr-1" />
                                Item
                                <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic opacity-70">
                        No related claims or items
                      </div>
                    )}
                  </div>
                  
                  {/* Column 4: Actions */}
                  <div className="p-5 flex items-center justify-center lg:justify-end bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="w-full lg:w-40 flex flex-col gap-2">
                      {appointment.appointmentType === 'reserve_item_pickup' && !appointment.relatedClaimId && (
                        <Button size="sm" variant="outline" onClick={() => linkClaim.mutate(appointment.id)} disabled={linkClaim.isPending}>
                          Link approved claim
                        </Button>
                      )}
                      <Label className="text-xs text-muted-foreground lg:hidden">Update Status</Label>
                      <Select 
                        value={appointment.status} 
                        onValueChange={(next) => {
                          if (next === appointment.status) return;
                          let reason: string | undefined;
                          if (next === 'canceled' || next === 'no_show') {
                            reason = window.prompt(`Reason for ${next.replace('_', ' ')}`)?.trim();
                            if (!reason) return;
                          }
                          update.mutate({ id: appointment.id, next, reason });
                        }}
                        disabled={update.isPending}
                      >
                        <SelectTrigger className="w-full font-medium h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['requested','confirmed','in_progress','completed','canceled','no_show'].map(value => (
                            <SelectItem key={value} value={value} className="capitalize">
                              {value.replace('_',' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {update.isPending && <p className="text-xs text-center text-muted-foreground animate-pulse">Saving...</p>}
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