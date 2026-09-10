import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, MapPin, ChevronRight, User, Mail, Phone, Package, Navigation, Loader2, AlertTriangle, Globe } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';

const TYPES = [
  { value: 'donation_dropoff', label: 'Donation Drop-off', desc: 'Bring items directly to a station.' },
  { value: 'donation_pickup', label: 'Donation Pickup', desc: 'Schedule a time for us to pick up large items.' },
  { value: 'receiver_pickup', label: 'Receiver Pickup Window', desc: 'Pick up items matched to you.' },
  { value: 'reserve_item_pickup', label: 'Reserve Item Pickup', desc: 'Collect reserved inventory items.' },
  { value: 'volunteer_shift', label: 'Volunteer Shift', desc: 'Join us for an operational shift.' },
  { value: 'donation_market', label: 'Donation Market Window', desc: 'Visit our open market hours.' },
] as const;

type Slot = {
  id: string;
  appointmentType: string;
  station: { code: string; zone: string };
  scheduledStart: string;
  scheduledEnd: string;
  spotsAvailable: number;
};

export default function Schedule({ mode = 'standard' }: { mode?: 'standard' | 'volunteer' }) {
  const isVolunteer = mode === 'volunteer';
  const [type, setType] = useState<string>(isVolunteer ? 'volunteer_shift' : '');
  const [slotId, setSlotId] = useState('');
  const [form, setForm] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    pickupAddress: '',
    trackingCode: ''
  });
  const [confirmation, setConfirmation] = useState<{ id: string; status: string } | null>(null);

  const { data: slots = [], isLoading: isLoadingSlots } = useQuery<Slot[]>({
    queryKey: ['public-capacity-slots', type],
    queryFn: () => customFetch(`/api/public/capacity-slots?appointmentType=${type}`, { responseType: 'json' }),
    enabled: !!type,
  });

  const selectedSlot = useMemo(() => slots.find(slot => slot.id === slotId), [slots, slotId]);

  const booking = useMutation({
    mutationFn: () => customFetch<{ id: string; status: string }>('/api/public/appointments', {
      method: 'POST',
      responseType: 'json',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentType: type, capacitySlotId: slotId, ...form }),
    }),
    onSuccess: setConfirmation,
  });

  const isValid = selectedSlot && form.contactName && (form.contactEmail || form.contactPhone)
    && (type !== 'reserve_item_pickup' || form.trackingCode);
  const selectedTypeDetails = TYPES.find(t => t.value === type);

  if (confirmation) {
    return (
      <main className="w-full flex-1 bg-background flex items-center justify-center p-4 animate-fade-in py-12">
        <Card className="max-w-md w-full shadow-xl border-border">
          <CardContent className="pt-12 pb-10 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Request Confirmed</h1>
              <p className="mt-2 font-medium text-muted-foreground">
                Your appointment request has been sent to our staff.
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-6 border border-border shadow-inner">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Reference Code</p>
              <p className="text-3xl font-mono font-bold text-foreground tracking-wider">
                {confirmation.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <p className="text-xs font-medium text-muted-foreground px-4">
              Staff will confirm the request shortly. SMS notifications are not enabled.
            </p>
            <Button
              variant="outline"
              className="w-full mt-4 h-12 font-bold tracking-wide"
              onClick={() => {
                setConfirmation(null);
                setSlotId('');
                setType(isVolunteer ? 'volunteer_shift' : '');
                setForm({ contactName: '', contactEmail: '', contactPhone: '', pickupAddress: '', trackingCode: '' });
              }}
            >
              {isVolunteer ? 'Schedule Another Shift' : 'Schedule Another'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="w-full flex-1 bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-10 animate-fade-in">
        <div className="text-center space-y-4">
          <div className="mx-auto mb-2 w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center shadow-md">
            {isVolunteer ? <User className="h-6 w-6" /> : <Globe className="h-6 w-6" />}
          </div>
          <p className="font-bold uppercase tracking-widest text-primary text-xs">W.O.W. Operating System</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {isVolunteer ? 'Volunteer With Us' : 'Schedule a visit'}
          </h1>
          <p className="text-base font-medium text-muted-foreground max-w-xl mx-auto leading-relaxed">
            {isVolunteer
              ? 'Join our team for an operational shift. We rely on community volunteers to keep the station running smoothly.'
              : "Find a time to drop off, pick up, or volunteer. We'll make sure everything is ready for your arrival."}
          </p>
        </div>

        <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[2px] before:bg-gradient-to-b before:from-border/0 before:via-border before:to-border/0">
          
          {/* Step 1 */}
          {!isVolunteer && (
            <div className="relative flex items-start gap-6 md:gap-8">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-primary text-primary-foreground font-bold text-lg shrink-0 z-10 shadow-md">
                1
              </div>
              <Card className="flex-1 shadow-md border-border transition-all">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">What are you scheduling?</CardTitle>
                  <CardDescription className="font-medium">Select the type of appointment you need.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={type} onValueChange={(value) => { setType(value); setSlotId(''); }}>
                    <SelectTrigger className="w-full text-base h-14 font-medium bg-card">
                      <SelectValue placeholder="Select appointment type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-foreground">{t.label}</span>
                            <span className="text-xs font-medium text-muted-foreground mt-1">{t.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2 */}
          <div className={`relative flex items-start gap-6 md:gap-8 transition-opacity duration-300 ${!type ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-lg shrink-0 z-10 shadow-md transition-colors ${type ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 bg-muted text-muted-foreground'}`}>
              {isVolunteer ? '1' : '2'}
            </div>
            <Card className="flex-1 shadow-md border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold">Choose an available time</CardTitle>
                <CardDescription className="font-medium">
                  {type ? `Showing availability for ${selectedTypeDetails?.label}.` : 'Select an appointment type first.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!type ? (
                  <div className="py-8 text-center font-medium text-muted-foreground/60 bg-muted/20 rounded-xl border border-dashed border-border">
                    Awaiting selection...
                  </div>
                ) : isLoadingSlots ? (
                  <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-4 bg-muted/20 rounded-xl border border-border">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="font-medium tracking-wide">Finding available times...</p>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="py-12 text-center bg-muted/20 rounded-xl border border-dashed border-border flex flex-col items-center">
                    <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-4" />
                    <p className="text-foreground font-bold text-lg">No open times available</p>
                    <p className="text-sm font-medium text-muted-foreground mt-1">
                      {isVolunteer
                        ? 'Please check back later for a published volunteer shift.'
                        : 'Please check back later or select another type.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {slots.map(slot => {
                      const start = new Date(slot.scheduledStart);
                      const end = new Date(slot.scheduledEnd);
                      const isSelected = slotId === slot.id;
                      
                      return (
                        <button 
                          key={slot.id} 
                          onClick={() => setSlotId(slot.id)} 
                          className={`relative text-left flex flex-col rounded-xl border p-5 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
                            isSelected 
                              ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary scale-[1.02]'
                              : 'border-border bg-card hover:bg-muted/30 hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-start justify-between w-full mb-4">
                            <div className={`flex items-center gap-2 font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                              <CalendarDays className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                              {format(start, 'EEE, MMM d')}
                            </div>
                            {slot.spotsAvailable < 5 && (
                              <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                                {slot.spotsAvailable} left
                              </span>
                            )}
                          </div>
                          <div className="space-y-2 w-full">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Clock className="h-4 w-4 shrink-0" />
                              <span>{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />
                              <span className="truncate">{slot.station.code} <span className="text-border mx-1">•</span> {slot.station.zone}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="absolute top-4 right-4 text-primary">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Step 3 */}
          <div className={`relative flex items-start gap-6 md:gap-8 transition-opacity duration-300 ${!slotId ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-lg shrink-0 z-10 shadow-md transition-colors ${slotId ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 bg-muted text-muted-foreground'}`}>
              {isVolunteer ? '2' : '3'}
            </div>
            <Card className="flex-1 shadow-md border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold">Your information</CardTitle>
                <CardDescription className="font-medium">Let us know who to expect.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2.5">
                      <Label htmlFor="name" className="text-foreground font-bold">Full Name *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="name"
                          className="pl-9 h-12 bg-card"
                          placeholder="Jane Doe" 
                          value={form.contactName} 
                          onChange={e => setForm({ ...form, contactName: e.target.value })} 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="email" className="text-foreground font-bold">Email Address *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email"
                          type="email" 
                          className="pl-9 h-12 bg-card"
                          placeholder="jane@example.com" 
                          value={form.contactEmail} 
                          onChange={e => setForm({ ...form, contactEmail: e.target.value })} 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="phone" className="text-foreground font-bold flex items-center gap-2">Phone Number <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider">(optional)</span></Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="phone"
                          className="pl-9 h-12 bg-card"
                          placeholder="(555) 123-4567" 
                          value={form.contactPhone} 
                          onChange={e => setForm({ ...form, contactPhone: e.target.value })} 
                        />
                      </div>
                    </div>
                  </div>

                  {(type === 'donation_pickup' || type === 'reserve_item_pickup') && <Separator className="my-4" />}

                  {type === 'donation_pickup' && (
                    <div className="space-y-2.5">
                      <Label htmlFor="address" className="text-foreground font-bold">Pickup Address (Private) *</Label>
                      <div className="relative">
                        <Navigation className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="address"
                          className="pl-9 h-12 bg-card"
                          placeholder="123 Main St, City, Zip" 
                          value={form.pickupAddress} 
                          onChange={e => setForm({ ...form, pickupAddress: e.target.value })} 
                        />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground mt-2">Your address is kept private and only shared with the driving team.</p>
                    </div>
                  )}

                  {type === 'reserve_item_pickup' && (
                    <div className="space-y-2.5">
                      <Label htmlFor="tracking" className="text-foreground font-bold">DSC Tracking Code *</Label>
                      <div className="relative">
                        <Package className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="tracking"
                          className="pl-9 h-12 bg-card uppercase font-mono font-bold tracking-widest text-lg"
                          placeholder="DSC-XXXXX" 
                          value={form.trackingCode} 
                          onChange={e => setForm({ ...form, trackingCode: e.target.value.toUpperCase() })} 
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-6 border-t border-border/50">
                    <Button 
                      size="lg"
                      className="w-full sm:w-auto px-10 h-14 font-bold tracking-wide shadow-lg text-base"
                      disabled={!isValid || booking.isPending} 
                      onClick={() => booking.mutate()}
                    >
                      {booking.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Submitting Request...
                        </>
                      ) : (
                        <>
                          Request Appointment
                          <ChevronRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                    
                    {booking.isError && (
                      <div className="mt-4 p-4 bg-destructive/10 text-destructive text-sm font-medium rounded-lg border border-destructive/20 flex items-start gap-3">
                        <AlertTriangle className="shrink-0 mt-0.5 h-5 w-5" />
                        <span>This appointment could not be booked. Please verify your details or choose another time slot.</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
