import { useState } from 'react';
import { Package, Heart, CheckCircle2 } from 'lucide-react';
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
      setError('Please enter what you\'re donating.');
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
          notes: `Logistics: ${form.logistics === 'pickup' ? 'Needs pickup' : 'Will drop off'}`,
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
    <div className="min-h-screen bg-gradient-to-b from-[#2C4B6E] to-[#1e3650] flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center gap-3">
        <div className="bg-white/10 rounded-full p-2">
          <Package className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Donation Station</h1>
          <p className="text-white/60 text-xs">Community Donation Center</p>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-lg">
          {success ? (
            /* ── Success state ── */
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 rounded-full p-4">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Thank you — logged tonight, routed by tomorrow. You'll get a note when it moves.
              </h2>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6 mt-6">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Your lot number</p>
                <p className="text-3xl font-mono font-bold text-[#2C4B6E]">{success.lotNumber}</p>
                <p className="text-xs text-gray-400 mt-1">Item ID: {success.itemId}</p>
              </div>

              <Button
                onClick={handleDonateAnother}
                className="w-full bg-[#2C4B6E] hover:bg-[#1e3650] text-white"
              >
                <Heart className="mr-2 w-4 h-4" />
                Donate Another Item
              </Button>
            </div>
          ) : (
            /* ── Form ── */
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Form header */}
              <div className="bg-gradient-to-r from-[#1E7A4E] to-[#166040] px-8 py-6">
                <div className="flex items-center gap-3 mb-1">
                  <Heart className="w-5 h-5 text-white/80" />
                  <h2 className="text-xl font-bold text-white">
                    Have something to donate? Log it here in 30 seconds.
                  </h2>
                </div>
                <p className="text-white/70 text-sm">
                  We take bulk t-shirts, fabric, hygiene, household goods — we wash, sort, and
                  route within 48 hours across South Side stations.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-5">
                {/* Item name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                    What is it? <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. Bulk t-shirts, Winter coats, Fabric bolts"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                  />
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <Label htmlFor="quantity" className="text-sm font-medium text-gray-700">
                    How many?
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => set('quantity', e.target.value)}
                  />
                </div>

                {/* Condition */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Condition</Label>
                  <Select value={form.condition} onValueChange={(v) => set('condition', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">✨ Excellent — like new</SelectItem>
                      <SelectItem value="good">👍 Good — minor wear</SelectItem>
                      <SelectItem value="fair">🙂 Fair — usable but worn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pickup or drop-off */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Pickup or drop-off?
                  </Label>
                  <Select
                    value={form.logistics}
                    onValueChange={(v) => set('logistics', v as FormState['logistics'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dropoff">🚶 I'll drop it off</SelectItem>
                      <SelectItem value="pickup">🚚 Please pick it up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Contact */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact" className="text-sm font-medium text-gray-700">
                    Contact <span className="text-gray-400 font-normal">(name, phone, or email)</span>
                  </Label>
                  <Input
                    id="contact"
                    placeholder="e.g. Jane Smith, (555) 123-4567"
                    value={form.contact}
                    onChange={(e) => set('contact', e.target.value)}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#2C4B6E] hover:bg-[#1e3650] text-white h-11 text-base"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Submitting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Heart className="w-4 h-4" />
                      Submit Donation
                    </span>
                  )}
                </Button>

                <p className="text-center text-xs text-gray-400">
                  Your donation will be reviewed by our team before entering the system.
                  No account needed — just a kind heart. 💙
                </p>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
