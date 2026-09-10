import { useState } from 'react';
import { Package, Heart, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  donorName: string;
  name: string;
  category: string;
  condition: string;
  quantity: string;
  perishable: boolean;
  expiryDate: string;
  temperatureZone: string;
  weight: string;
  origin: string;
  notes: string;
}

const INITIAL: FormState = {
  donorName: '',
  name: '',
  category: '',
  condition: 'good',
  quantity: '1',
  perishable: false,
  expiryDate: '',
  temperatureZone: 'ambient',
  weight: '',
  origin: '',
  notes: '',
};

export default function Donate() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ lotNumber: string; itemId: string } | null>(null);

  function set(field: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Please enter the item name.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donorName: form.donorName || undefined,
          name: form.name,
          category: form.category || undefined,
          condition: form.condition,
          quantity: parseInt(form.quantity, 10) || 1,
          perishable: form.perishable,
          expiryDate: form.perishable ? form.expiryDate || undefined : undefined,
          temperatureZone: form.perishable ? form.temperatureZone : undefined,
          weight: form.perishable && form.weight ? parseFloat(form.weight) : undefined,
          origin: form.origin || undefined,
          notes: form.notes || undefined,
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
                  Thank you for donating!
                </h2>
                <p className="text-muted-foreground mb-8">
                  Our team will review your submission shortly. Here is your reference number — keep it handy!
                </p>

                <div className="bg-muted/30 rounded-xl border border-border p-6 mb-8 shadow-inner">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Your lot number</p>
                  <p className="text-4xl font-mono font-bold text-primary tracking-wider">{success.lotNumber}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-2">Item ID: {success.itemId}</p>
                </div>

                <p className="text-sm text-muted-foreground font-medium mb-8 max-w-sm mx-auto">
                  Every donation makes a difference. Our coordinators will be in touch if they need more information.
                </p>

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
                  <h2 className="text-2xl font-bold text-primary-foreground">Donate an Item</h2>
                </div>
                <p className="text-primary-foreground/80 font-medium text-sm">
                  Fill in what you know — everything except the item name is optional.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {/* Donor name */}
                <div className="space-y-2">
                  <Label htmlFor="donorName" className="text-foreground font-bold">
                    Your name <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                  </Label>
                  <Input
                    id="donorName"
                    className="h-11 bg-card"
                    placeholder="Jane Smith or Local Bakery"
                    value={form.donorName}
                    onChange={(e) => set('donorName', e.target.value)}
                  />
                </div>

                {/* Item name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground font-bold">
                    What are you donating? <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    className="h-11 bg-card"
                    placeholder="Canned tomatoes, Winter coat, Blanket set"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                  />
                </div>

                {/* Category + Quantity */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-foreground font-bold">
                      Category <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                    </Label>
                    <Input
                      id="category"
                      className="h-11 bg-card"
                      placeholder="Food, Clothing"
                      value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-foreground font-bold">
                      Quantity
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

                {/* Perishable toggle */}
                <div className="rounded-xl border border-border bg-card overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => set('perishable', !form.perishable)}
                    className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                          form.perishable ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-1 ${
                            form.perishable ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        This item is perishable
                      </span>
                    </div>
                    {form.perishable ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {form.perishable && (
                    <div className="px-4 py-5 space-y-5 border-t border-border bg-muted/10">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="expiryDate" className="text-foreground font-bold">
                            Best before / Expiry
                          </Label>
                          <Input
                            id="expiryDate"
                            className="h-11 bg-card"
                            type="date"
                            value={form.expiryDate}
                            onChange={(e) => set('expiryDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="weight" className="text-foreground font-bold">
                            Weight (kg) <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                          </Label>
                          <Input
                            id="weight"
                            className="h-11 bg-card"
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="2.5"
                            value={form.weight}
                            onChange={(e) => set('weight', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-foreground font-bold">
                          Storage temperature
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'ambient', label: 'Room temp' },
                            { value: 'refrigerated', label: 'Refrigerated' },
                            { value: 'frozen', label: 'Frozen' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => set('temperatureZone', opt.value)}
                              className={`rounded-lg border px-2 py-2.5 text-xs font-bold transition-colors text-center ${
                                form.temperatureZone === opt.value
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Origin */}
                <div className="space-y-2">
                  <Label htmlFor="origin" className="text-foreground font-bold">
                    Where is it from? <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                  </Label>
                  <Input
                    id="origin"
                    className="h-11 bg-card"
                    placeholder="Home garden, Local restaurant, Manufacturer donation"
                    value={form.origin}
                    onChange={(e) => set('origin', e.target.value)}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-foreground font-bold">
                    Anything else we should know? <span className="text-muted-foreground/60 font-medium text-xs uppercase tracking-wider ml-1">(optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    className="bg-card resize-none"
                    placeholder="Special instructions, pick-up details, allergies, etc."
                    rows={3}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
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

                <p className="text-center text-xs font-medium text-muted-foreground mt-4">
                  Your donation will be reviewed by our team before entering the system.
                  No account needed — just a kind heart.
                </p>
              </form>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
