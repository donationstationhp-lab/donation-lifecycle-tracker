import { useState } from 'react';
import { Heart, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

// We bypass the API-key-injecting client and call the public endpoint directly.
const API_BASE = '/api';

interface FormState {
  name: string;
  quantity: string;
  condition: string;
  logistics: 'pickup' | 'dropoff';
  contact: string;
}

const INITIAL: FormState = {
  name: '',
  quantity: '1',
  condition: 'good',
  logistics: 'dropoff',
  contact: '',
};

export default function Donate() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ lotNumber: string; itemId: string } | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Please enter what you’re donating.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donorName: form.contact || undefined,
          name: form.name,
          condition: form.condition,
          quantity: parseInt(form.quantity, 10) || 1,
          notes:
            form.logistics === 'pickup'
              ? 'Needs pickup'
              : 'Will be dropped off',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSuccess({ lotNumber: data.lotNumber, itemId: data.itemId });
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDonateAnother() {
    setForm(INITIAL);
    setSuccess(null);
    setError(null);
  }

  return (
    <div className="w-full flex-1 flex flex-col animate-fade-in">
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {success ? (
            /* ── Success state ── */
            <Card className="shadow-xl border-border text-center overflow-hidden">
              <CardContent className="pt-10 pb-8 px-8">
                <div className="flex justify-center mb-6">
                  <div className="bg-primary/10 rounded-full p-4 border border-primary/20">
                    <CheckCircle2 className="w-12 h-12 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Thank you — logged tonight. Our team will review it and follow up if they need anything else.
                </h2>

                <div className="bg-muted/30 rounded-xl border border-border p-6 mb-8 mt-6 shadow-inner">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Your lot number</p>
                  <p className="text-4xl font-mono font-bold text-primary tracking-wider">{success.lotNumber}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-2">Item ID: {success.itemId}</p>
                </div>

                <Button
                  onClick={handleDonateAnother}
                  className="w-full h-12 text-base font-bold tracking-wide"
                >
                  <Heart className="mr-2 w-4 h-4" />
                  Donate Another Item
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* ── Form ── */
            <Card className="shadow-xl border-border overflow-hidden">
              {/* Form header */}
              <div className="bg-primary px-8 py-6 border-b border-primary-border">
                <div className="flex items-center gap-3 mb-1">
                  <Heart className="w-6 h-6 text-primary-foreground/90" />
                  <h2 className="text-2xl font-bold text-primary-foreground">
                    Have something to donate? Log it here in 30 seconds.
                  </h2>
                </div>
                <p className="text-primary-foreground/80 font-medium text-sm">
                  We take bulk t-shirts, fabric, hygiene, household goods — our team sorts and routes
                  donations across South Side stations.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {/* What is it */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground font-bold">
                    What is it? <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    className="h-11 bg-card"
                    placeholder="Bulk t-shirts, Winter coats, Hygiene kits"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                  />
                </div>

                {/* How many */}
                <div className="space-y-2">
                  <Label htmlFor="quantity" className="text-foreground font-bold">
                    How many?
                  </Label>
                  <Input
                    id="quantity"
                    className="h-11 bg-card"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => set('quantity', e.target.value)}
                  />
                </div>

                {/* Condition */}
                <div className="space-y-2">
                  <Label className="text-foreground font-bold">Condition</Label>
                  <Select value={form.condition} onValueChange={(v) => set('condition', v)}>
                    <SelectTrigger className="h-11 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent — like new</SelectItem>
                      <SelectItem value="good">Good — minor wear</SelectItem>
                      <SelectItem value="fair">Fair — usable but worn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pickup or drop-off */}
                <div className="space-y-2">
                  <Label className="text-foreground font-bold">Pickup or drop-off?</Label>
                  <Select
                    value={form.logistics}
                    onValueChange={(v) => set('logistics', v as FormState['logistics'])}
                  >
                    <SelectTrigger className="h-11 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dropoff">I’ll drop it off</SelectItem>
                      <SelectItem value="pickup">Please pick it up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Contact */}
                <div className="space-y-2">
                  <Label htmlFor="contact" className="text-foreground font-bold">
                    Contact <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                  </Label>
                  <Input
                    id="contact"
                    className="h-11 bg-card"
                    placeholder="Phone or email so we can reach you"
                    value={form.contact}
                    onChange={(e) => set('contact', e.target.value)}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm font-medium text-destructive">
                    {error}
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 text-base font-bold tracking-wide shadow-md"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Heart className="w-5 h-5" />
                        Submit Donation
                      </span>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
