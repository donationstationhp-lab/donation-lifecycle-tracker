import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  AlertTriangle,
  User,
  Tag,
  Thermometer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const API_BASE = '/api';

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

interface DonationItem {
  id: string;
  itemId: string;
  name: string;
  category: string;
  condition: string;
  donor: string;
  expiryDate: string | null;
  temperatureZone: string;
  weight: number | null;
  origin: string | null;
  lotNumber: string;
  stage: string;
  pendingReview: boolean;
  createdAt: string;
}

function ConditionLabel({ condition }: { condition: string }) {
  const map: Record<string, { label: string; className: string }> = {
    excellent: { label: 'Excellent', className: 'bg-emerald-100 text-emerald-800' },
    good: { label: 'Good', className: 'bg-blue-100 text-blue-800' },
    fair: { label: 'Fair', className: 'bg-amber-100 text-amber-800' },
    poor: { label: 'Poor', className: 'bg-red-100 text-red-800' },
  };
  const c = map[condition] ?? { label: condition, className: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

export default function PendingReview() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [actingOn, setActingOn] = useState<string | null>(null);

  const { data: items, isLoading, isError } = useQuery<DonationItem[]>({
    queryKey: ['pending-items'],
    queryFn: () =>
      apiFetch('/items?pendingReview=true').then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      }),
    refetchInterval: 20000,
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/items/${id}/approve`, { method: 'POST' }).then((r) => {
        if (!r.ok) throw new Error('Approve failed');
        return r.json();
      }),
    onSuccess: (_, id) => {
      toast({ title: 'Item approved', description: 'It has been cleared for intake processing.' });
      qc.invalidateQueries({ queryKey: ['pending-items'] });
      qc.invalidateQueries({ queryKey: ['pending-count'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setActingOn(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not approve the item.', variant: 'destructive' });
      setActingOn(null);
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/items/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok && r.status !== 204) throw new Error('Reject failed');
      }),
    onSuccess: () => {
      toast({ title: 'Item rejected', description: 'The donation has been removed from the system.' });
      qc.invalidateQueries({ queryKey: ['pending-items'] });
      qc.invalidateQueries({ queryKey: ['pending-count'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setActingOn(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not reject the item.', variant: 'destructive' });
      setActingOn(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        Failed to load pending items. Please refresh.
      </div>
    );
  }

  const pending = items ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="bg-amber-100 rounded-full p-2">
          <Clock className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Review</h1>
          <p className="text-muted-foreground text-sm">
            Items submitted by donors that need staff verification before processing.
          </p>
        </div>
        {pending.length > 0 && (
          <Badge className="ml-auto bg-amber-500 hover:bg-amber-500 text-white text-sm px-3 py-1">
            {pending.length} awaiting
          </Badge>
        )}
      </div>

      {pending.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
            <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No donor submissions are waiting for review right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((item) => {
            const busy = actingOn === item.id;
            const perishable = item.expiryDate || item.temperatureZone !== 'ambient';

            return (
              <Card
                key={item.id}
                className="border-amber-200 bg-amber-50/30 shadow-sm transition-all"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="bg-amber-100 rounded-lg p-2 mt-0.5">
                        <Package className="w-4 h-4 text-amber-700" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{item.name}</CardTitle>
                        <CardDescription className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {item.category}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.donor}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {format(new Date(item.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ConditionLabel condition={item.condition} />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {item.lotNumber}
                    </span>
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {item.itemId}
                    </span>
                    {perishable && (
                      <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                        <Thermometer className="w-3 h-3" />
                        {item.temperatureZone}
                        {item.expiryDate ? ` · expires ${item.expiryDate}` : ''}
                        {item.weight ? ` · ${item.weight}kg` : ''}
                      </span>
                    )}
                    {item.origin && (
                      <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded">
                        From: {item.origin}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      className="bg-[#1E7A4E] hover:bg-[#166040] text-white gap-1.5"
                      disabled={busy}
                      onClick={() => {
                        setActingOn(item.id);
                        approve.mutate(item.id);
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Reject and permanently delete "${item.name}"?`)) {
                          setActingOn(item.id);
                          reject.mutate(item.id);
                        }
                      }}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
