import { useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateItem, DonationItemInputTier, DonationItemInputCondition, DonationItemInputTemperatureZone } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ArrowLeft, Dna } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  category: z.string().min(2, "Category is required"),
  tier: z.enum(['T', 'I', 'E', 'R'] as const),
  condition: z.enum(['good', 'fair', 'poor'] as const),
  donor: z.string().min(2, "Donor is required"),
  recipient: z.string().optional(),
  location: z.string().optional(),
  expiryDate: z.string().optional(),
  temperatureZone: z.enum(['ambient', 'refrigerated', 'frozen'] as const).optional(),
  weight: z.coerce.number().optional(),
  origin: z.string().optional(),
  lotNumber: z.string().optional(),
  powerConnectionReading: z.string().optional(),
});

export default function IntakeForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createItem = useCreateItem();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      category: '',
      tier: 'T',
      condition: 'good',
      donor: '',
      recipient: '',
      location: '',
      expiryDate: '',
      temperatureZone: 'ambient',
      weight: undefined,
      origin: '',
      lotNumber: '',
      powerConnectionReading: '',
    },
  });

  const generateLotNumber = () => {
    return `LOT-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const generatePowerReading = () => {
    // Generate a pseudo-mystical numerology reading
    const readings = ['7-2-9 Alpha', '3-3-3 Resonance', '9-1-1 Vertex', '8-8-8 Harmonic', '5-4-3 Zenith'];
    return readings[Math.floor(Math.random() * readings.length)];
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const lotNumber = values.lotNumber || generateLotNumber();
    
    // Clean up empty optional strings to undefined
    const cleanValues = { ...values };
    Object.keys(cleanValues).forEach(key => {
      const k = key as keyof typeof cleanValues;
      if (cleanValues[k] === '') {
        delete cleanValues[k];
      }
    });

    createItem.mutate({ 
      data: {
        ...cleanValues,
        lotNumber,
      } as any 
    }, {
      onSuccess: (data) => {
        toast({
          title: "Item Logged",
          description: `Successfully intaken ${data.itemId}`,
        });
        setLocation(`/items/${data.id}`);
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to intake item.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/items">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake New Item</h1>
          <p className="text-muted-foreground text-sm">Log a donated item into the system</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Core Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Winter Blankets" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl><Input placeholder="e.g. Clothing" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tier" render={({ field }) => (
                <FormItem>
                  <FormLabel>T.I.E.R. Class</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Tier" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="T"><span className="text-tier-t font-semibold">Time (T)</span></SelectItem>
                      <SelectItem value="I"><span className="text-tier-i font-semibold">Intelligence (I)</span></SelectItem>
                      <SelectItem value="E"><span className="text-tier-e font-semibold">Energy (E)</span></SelectItem>
                      <SelectItem value="R"><span className="text-tier-r font-semibold">Resources (R)</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="condition" render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Condition" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Logistics & Source</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="donor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Donor / Source</FormLabel>
                  <FormControl><Input placeholder="Who donated this?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="origin" render={({ field }) => (
                <FormItem>
                  <FormLabel>Origin (Optional)</FormLabel>
                  <FormControl><Input placeholder="City, Region..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="temperatureZone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperature Zone</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Zone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ambient">Ambient (Normal)</SelectItem>
                      <SelectItem value="refrigerated">Refrigerated</SelectItem>
                      <SelectItem value="frozen">Frozen</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="weight" render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight (kg) (Optional)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="0.0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="expiryDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date (Optional)</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Location (Optional)</FormLabel>
                  <FormControl><Input placeholder="Warehouse A, Shelf 3..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-indigo-100 bg-indigo-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-900">
                <Dna className="w-5 h-5 text-indigo-500" />
                Specialized Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="lotNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lot Number</FormLabel>
                  <div className="flex gap-2">
                    <FormControl><Input placeholder="LOT-XXXX (Auto-generated if empty)" {...field} /></FormControl>
                    <Button type="button" variant="outline" onClick={() => form.setValue('lotNumber', generateLotNumber())}>
                      Generate
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="powerConnectionReading" render={({ field }) => (
                <FormItem>
                  <FormLabel>Power Connection Reading</FormLabel>
                  <div className="flex gap-2">
                    <FormControl><Input placeholder="Numerology value..." {...field} /></FormControl>
                    <Button type="button" variant="outline" onClick={() => form.setValue('powerConnectionReading', generatePowerReading())}>
                      Read
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/items">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createItem.isPending} className="bg-tier-e hover:bg-tier-e/90 text-white min-w-32">
              {createItem.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Intake
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}