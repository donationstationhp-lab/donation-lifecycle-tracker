import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetItem, getGetItemQueryKey, useAdvanceItemStage, DonationItemStage } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, ArrowRight, Package, MapPin, Calendar, Scale, Map, 
  User, CheckCircle2, History, Loader2, ArrowUpCircle
} from 'lucide-react';
import { TierBadge, StageChip, ConditionChip, TempZoneIcon, NumerologyReading } from '@/components/shared';
import { format } from 'date-fns';

const stageFlow: DonationItemStage[] = ['intake', 'qc', 'storage', 'distributed'];

export default function ItemDetail() {
  const [, params] = useRoute('/items/:id');
  const id = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: item, isLoading, isError } = useGetItem(id, { 
    query: { enabled: !!id, queryKey: getGetItemQueryKey(id) } 
  });
  const advanceStage = useAdvanceItemStage();

  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);
  const [advanceNotes, setAdvanceNotes] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="p-12 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
        <h2 className="text-xl font-bold mb-2">Item Not Found</h2>
        <p className="mb-6">The item you are looking for does not exist or an error occurred.</p>
        <Link href="/items">
          <Button variant="outline">Return to Inventory</Button>
        </Link>
      </div>
    );
  }

  const currentStageIndex = stageFlow.indexOf(item.stage);
  const nextStage = currentStageIndex < stageFlow.length - 1 ? stageFlow[currentStageIndex + 1] : null;

  const handleAdvance = () => {
    if (!nextStage) return;
    
    advanceStage.mutate({
      id,
      data: {
        stage: nextStage as any,
        notes: advanceNotes || undefined
      }
    }, {
      onSuccess: (updatedData) => {
        setIsAdvanceDialogOpen(false);
        setAdvanceNotes('');
        queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/items'] });
        toast({
          title: "Stage Advanced",
          description: `${item.itemId} is now in ${nextStage}`,
        });
      },
      onError: (err: any) => {
        toast({
          title: "Error advancing stage",
          description: err.message || "An error occurred.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/items">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{item.name}</h1>
              <span className="font-mono text-sm md:text-base bg-secondary text-muted-foreground px-2 py-1 rounded border border-border">
                {item.itemId}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              {item.category} • Added {format(new Date(item.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        {nextStage && (
          <Button 
            onClick={() => setIsAdvanceDialogOpen(true)}
            className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            Advance to {nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Status & Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
                <div className="p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Current Stage</span>
                  <div><StageChip stage={item.stage} /></div>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">T.I.E.R. Class</span>
                  <div><TierBadge tier={item.tier} /></div>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Condition</span>
                  <div><ConditionChip condition={item.condition} /></div>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Temp Zone</span>
                  <div className="flex items-center gap-1.5 font-medium text-sm capitalize">
                    {item.temperatureZone ? (
                      <>
                        <TempZoneIcon zone={item.temperatureZone} />
                        {item.temperatureZone}
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal">N/A</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Logistics Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><User className="w-3.5 h-3.5" /> Donor</span>
                <p className="font-medium">{item.donor}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Map className="w-3.5 h-3.5" /> Origin</span>
                <p className="font-medium">{item.origin || 'Not specified'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><MapPin className="w-3.5 h-3.5" /> Current Location</span>
                <p className="font-medium">{item.location || 'Not specified'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><User className="w-3.5 h-3.5" /> Intended Recipient</span>
                <p className="font-medium">{item.recipient || 'Unassigned'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Scale className="w-3.5 h-3.5" /> Weight</span>
                <p className="font-medium">{item.weight ? `${item.weight} kg` : 'Unknown'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5" /> Expiry Date</span>
                <p className={`font-medium ${item.expiryDate ? (new Date(item.expiryDate) < new Date() ? 'text-red-600' : '') : ''}`}>
                  {item.expiryDate ? format(new Date(item.expiryDate), 'MMM d, yyyy') : 'No expiry'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="shadow-sm border-indigo-100 bg-indigo-50/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase text-indigo-900 tracking-wider">
                Identity Traces
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs text-indigo-500/80 mb-1 block">Lot Number</span>
                <div className="font-mono bg-white border border-indigo-100 px-3 py-1.5 rounded text-sm text-indigo-950 font-medium">
                  {item.lotNumber}
                </div>
              </div>
              {item.powerConnectionReading && (
                <div>
                  <span className="text-xs text-indigo-500/80 mb-1 block">Power Reading</span>
                  <NumerologyReading reading={item.powerConnectionReading} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                Stage History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-border ml-3 space-y-6">
                {item.history.map((entry, index) => {
                  const isLatest = index === item.history.length - 1;
                  return (
                    <div key={entry.id} className="pl-6 relative">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${isLatest ? 'bg-primary ring-2 ring-primary/20' : 'bg-muted-foreground/30'}`} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm capitalize">{entry.toStage}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(entry.timestamp), 'MMM d, h:mm a')}</span>
                        </div>
                        {entry.fromStage && (
                          <span className="text-xs text-muted-foreground">Moved from {entry.fromStage}</span>
                        )}
                        {entry.notes && (
                          <div className="mt-2 text-sm bg-secondary/50 p-2 rounded border border-border/50 text-foreground/80 italic">
                            "{entry.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAdvanceDialogOpen} onOpenChange={setIsAdvanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance Stage to {nextStage}</DialogTitle>
            <DialogDescription>
              Are you sure you want to move {item.itemId} to the next stage in the pipeline?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4 justify-center bg-secondary/50 p-4 rounded-lg">
              <StageChip stage={item.stage} />
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              {nextStage && <StageChip stage={nextStage as any} />}
            </div>
            
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes (Optional)</label>
              <Textarea 
                id="notes" 
                placeholder="Any observations, quality check results, or movement details..."
                value={advanceNotes}
                onChange={(e) => setAdvanceNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdvanceDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAdvance} 
              disabled={advanceStage.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {advanceStage.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowUpCircle className="w-4 h-4 mr-2" />}
              Confirm Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}