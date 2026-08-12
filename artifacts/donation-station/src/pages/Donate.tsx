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
          weight:
            form.perishable && form.weight ? parseFloat(form.weight) : undefined,
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
                Thank you for donating!
              </h2>
              <p className="text-gray-500 mb-6">
                Our team will review your submission shortly. Here's your reference number — keep it handy!
              </p>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Your lot number</p>
                <p className="text-3xl font-mono font-bold text-[#2C4B6E]">{success.lotNumber}</p>
                <p className="text-xs text-gray-400 mt-1">Item ID: {success.itemId}</p>
              </div>

              <p className="text-sm text-gray-500 mb-6">
                Every donation makes a difference. Our coordinators will be in touch if they need more information.
              </p>

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
                  <h2 className="text-xl font-bold text-white">Donate an Item</h2>
                </div>
                <p className="text-white/70 text-sm">
                  Fill in what you know — everything except the item name is optional.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-5">
                {/* Donor name */}
                <div className="space-y-1.5">
                  <Label htmlFor="donorName" className="text-sm font-medium text-gray-700">
                    Your name <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="donorName"
                    placeholder="e.g. Jane Smith or Local Bakery"
                    value={form.donorName}
                    onChange={(e) => set('donorName', e.target.value)}
                  />
                </div>

                {/* Item name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                    What are you donating? <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g. Canned tomatoes, Winter coat, Blanket set"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                  />
                </div>

                {/* Category + Quantity */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="category" className="text-sm font-medium text-gray-700">
                      Category <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="category"
                      placeholder="e.g. Food, Clothing"
                      value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity" className="text-sm font-medium text-gray-700">
                      Quantity
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => set('quantity', e.target.value)}
                    />
                  </div>
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

                {/* Perishable toggle */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => set('perishable', !form.perishable)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-9 h-5 rounded-full transition-colors flex items-center ${
                          form.perishable ? 'bg-[#1E7A4E]' : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${
                            form.perishable ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        This item is perishable
                      </span>
                    </div>
                    {form.perishable ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {form.perishable && (
                    <div className="px-4 py-4 space-y-4 border-t border-gray-100 bg-white">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="expiryDate" className="text-sm font-medium text-gray-700">
                            Best before / Expiry
                          </Label>
                          <Input
                            id="expiryDate"
                            type="date"
                            value={form.expiryDate}
                            onChange={(e) => set('expiryDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="weight" className="text-sm font-medium text-gray-700">
                            Weight (kg) <span className="text-gray-400 font-normal">(optional)</span>
                          </Label>
                          <Input
                            id="weight"
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="e.g. 2.5"
                            value={form.weight}
                            onChange={(e) => set('weight', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-gray-700">
                          Storage temperature
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'ambient', label: '🌡️ Room temp' },
                            { value: 'refrigerated', label: '❄️ Refrigerated' },
                            { value: 'frozen', label: '🧊 Frozen' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => set('temperatureZone', opt.value)}
                              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors text-center ${
                                form.temperatureZone === opt.value
                                  ? 'border-[#2C4B6E] bg-[#2C4B6E]/5 text-[#2C4B6E]'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
                <div className="space-y-1.5">
                  <Label htmlFor="origin" className="text-sm font-medium text-gray-700">
                    Where is it from? <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="origin"
                    placeholder="e.g. Home garden, Local restaurant, Manufacturer donation"
                    value={form.origin}
                    onChange={(e) => set('origin', e.target.value)}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
                    Anything else we should know? <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Special instructions, pick-up details, allergies, etc."
                    rows={3}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
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
