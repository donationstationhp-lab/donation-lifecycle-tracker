import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, MapPin, ChevronRight, User, Mail, Phone, Package, Navigation, Loader2, AlertTriangle } from 'lucide-react';
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

export default function Schedule() {
  const [type, setType] = useState<string>('');
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
      <main className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-slate-200">
          <CardContent className="pt-12 pb-10 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Request Confirmed</h1>
              <p className="mt-2 text-slate-600">
                Your appointment request has been sent to our staff.
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold">Reference Code</p>
              <p className="text-2xl font-mono font-medium text-slate-800 mt-1">
                {confirmation.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Staff will confirm the request shortly. SMS notifications are not enabled.
            </p>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => {
                setConfirmation(null);
                setSlotId('');
                setType('');
                setForm({ contactName: '', contactEmail: '', contactPhone: '', pickupAddress: '', trackingCode: '' });
              }}
            >
              Schedule Another
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="text-center space-y-3">
          <p className="font-semibold uppercase tracking-widest text-primary text-sm">Donation Station</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Schedule a visit</h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Find a time to drop off, pick up, or volunteer. We'll make sure everything is ready for your arrival.
          </p>
        </div>

        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
          
          {/* Step 1 */}
          <div className="relative flex items-start gap-6 md:gap-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-primary text-primary-foreground font-semibold text-lg shrink-0 z-10 shadow-sm">
              1
            </div>
            <Card className="flex-1 shadow-sm transition-all">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">What are you scheduling?</CardTitle>
                <CardDescription>Select the type of appointment you need.</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={type} onValueChange={(value) => { setType(value); setSlotId(''); }}>
                  <SelectTrigger className="w-full text-base h-12">
                    <SelectValue placeholder="Select appointment type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{t.label}</span>
                          <span className="text-sm text-slate-500 mt-0.5">{t.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>

          {/* Step 2 */}
          <div className={`relative flex items-start gap-6 md:gap-8 transition-opacity duration-300 ${!type ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-lg shrink-0 z-10 shadow-sm transition-colors ${type ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-slate-50 text-slate-400'}`}>
              2
            </div>
            <Card className="flex-1 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Choose an available time</CardTitle>
                <CardDescription>
                  {type ? `Showing availability for ${selectedTypeDetails?.label}.` : 'Select an appointment type first.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!type ? (
                  <div className="py-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Awaiting selection...
                  </div>
                ) : isLoadingSlots ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-500 space-y-3 bg-slate-50 rounded-lg border border-slate-100">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p>Finding available times...</p>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="py-10 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <CalendarDays className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">No open times available</p>
                    <p className="text-sm text-slate-500 mt-1">Please check back later or select another type.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {slots.map(slot => {
                      const start = new Date(slot.scheduledStart);
                      const end = new Date(slot.scheduledEnd);
                      const isSelected = slotId === slot.id;
                      
                      return (
                        <button 
                          key={slot.id} 
                          onClick={() => setSlotId(slot.id)} 
                          className={`relative text-left flex flex-col rounded-xl border p-4 transition-all hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                            isSelected 
                              ? 'border-primary bg-primary/[0.03] shadow-sm ring-1 ring-primary' 
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between w-full mb-3">
                            <div className="flex items-center gap-2 font-semibold text-slate-900">
                              <CalendarDays className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-slate-500'}`} />
                              {format(start, 'EEE, MMM d')}
                            </div>
                            {slot.spotsAvailable < 5 && (
                              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                {slot.spotsAvailable} left
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5 w-full">
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                              <span>{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                              <span className="truncate">{slot.station.code} <span className="text-slate-300 mx-1">•</span> {slot.station.zone}</span>
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
          <div className={`relative flex items-start gap-6 md:gap-8 transition-opacity duration-300 ${!slotId ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-lg shrink-0 z-10 shadow-sm transition-colors ${slotId ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-slate-50 text-slate-400'}`}>
              3
            </div>
            <Card className="flex-1 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Your information</CardTitle>
                <CardDescription>Let us know who to expect.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-slate-700">Full Name *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          id="name"
                          className="pl-9" 
                          placeholder="Jane Doe" 
                          value={form.contactName} 
                          onChange={e => setForm({ ...form, contactName: e.target.value })} 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-700">Email Address *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          id="email"
                          type="email" 
                          className="pl-9" 
                          placeholder="jane@example.com" 
                          value={form.contactEmail} 
                          onChange={e => setForm({ ...form, contactEmail: e.target.value })} 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-slate-700 flex items-center gap-2">Phone Number <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          id="phone"
                          className="pl-9" 
                          placeholder="(555) 123-4567" 
                          value={form.contactPhone} 
                          onChange={e => setForm({ ...form, contactPhone: e.target.value })} 
                        />
                      </div>
                    </div>
                  </div>

                  {(type === 'donation_pickup' || type === 'reserve_item_pickup') && <Separator className="my-2" />}

                  {type === 'donation_pickup' && (
                    <div className="space-y-2">
                      <Label htmlFor="address" className="text-slate-700">Pickup Address (Private) *</Label>
                      <div className="relative">
                        <Navigation className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          id="address"
                          className="pl-9" 
                          placeholder="123 Main St, City, Zip" 
                          value={form.pickupAddress} 
                          onChange={e => setForm({ ...form, pickupAddress: e.target.value })} 
                        />
                      </div>
                      <p className="text-xs text-slate-500">Your address is kept private and only shared with the driving team.</p>
                    </div>
                  )}

                  {type === 'reserve_item_pickup' && (
                    <div className="space-y-2">
                      <Label htmlFor="tracking" className="text-slate-700">DSC Tracking Code *</Label>
                      <div className="relative">
                        <Package className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                          id="tracking"
                          className="pl-9 uppercase font-mono" 
                          placeholder="DSC-XXXXX" 
                          value={form.trackingCode} 
                          onChange={e => setForm({ ...form, trackingCode: e.target.value.toUpperCase() })} 
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-4">
                    <Button 
                      size="lg"
                      className="w-full sm:w-auto px-8 shadow-md" 
                      disabled={!isValid || booking.isPending} 
                      onClick={() => booking.mutate()}
                    >
                      {booking.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting Request...
                        </>
                      ) : (
                        <>
                          Request Appointment
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    
                    {booking.isError && (
                      <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100 flex items-start gap-2">
                        <AlertTriangle className="shrink-0 mt-0.5 h-4 w-4" />
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