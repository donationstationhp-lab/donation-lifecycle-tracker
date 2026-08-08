import { useState } from 'react';
import { useListItems, DonationItemStage, DonationItemTier, ListItemsParams } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FilterX, AlertCircle, Package } from 'lucide-react';
import { TierBadge, StageChip, ConditionChip, TempZoneIcon } from '@/components/shared';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function ItemsList() {
  const [stageTab, setStageTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState<DonationItemTier | null>(null);

  const params: ListItemsParams = {};
  if (stageTab !== 'all') params.stage = stageTab as DonationItemStage;
  if (selectedTier) params.tier = selectedTier;
  if (search.trim()) params.search = search;

  const { data: items, isLoading, isError } = useListItems(params);

  const tiers: DonationItemTier[] = ['T', 'I', 'E', 'R'];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            type="search" 
            placeholder="Search ID, name, donor..." 
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-white p-2 rounded-lg border border-border shadow-sm">
        {/* Stages Tab */}
        <div className="overflow-x-auto pb-1">
          <Tabs value={stageTab} onValueChange={setStageTab} className="w-full">
            <TabsList className="w-full justify-start h-auto p-1 bg-transparent">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-4 py-2">All Items</TabsTrigger>
              <TabsTrigger value="intake" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2">Intake</TabsTrigger>
              <TabsTrigger value="qc" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md px-4 py-2">QC</TabsTrigger>
              <TabsTrigger value="storage" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white rounded-md px-4 py-2">Storage</TabsTrigger>
              <TabsTrigger value="distributed" className="data-[state=active]:bg-green-600 data-[state=active]:text-white rounded-md px-4 py-2">Distributed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tier Filters */}
        <div className="flex items-center gap-2 px-2 overflow-x-auto pb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Tiers</span>
          {tiers.map(tier => (
            <button
              key={tier}
              onClick={() => setSelectedTier(selectedTier === tier ? null : tier)}
              className={`transition-all ${selectedTier === tier ? 'ring-2 ring-primary ring-offset-1 rounded' : 'opacity-70 hover:opacity-100'}`}
            >
              <TierBadge tier={tier} />
            </button>
          ))}
          {selectedTier && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedTier(null)} className="h-6 px-2 text-xs ml-2 text-muted-foreground">
              <FilterX className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {isLoading && (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="w-16 h-16 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {isError && (
          <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200 flex flex-col items-center">
            <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
            <p>Failed to load inventory.</p>
          </div>
        )}

        {!isLoading && !isError && items?.length === 0 && (
          <div className="p-12 text-center bg-secondary/30 rounded-xl border border-dashed border-border flex flex-col items-center text-muted-foreground">
            <Package className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground">No items found</p>
            <p className="text-sm">Try adjusting your filters or search query.</p>
            {(search || selectedTier || stageTab !== 'all') && (
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => { setSearch(''); setSelectedTier(null); setStageTab('all'); }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {!isLoading && items && items.map(item => (
          <Link key={item.id} href={`/items/${item.id}`}>
            <Card className="shadow-sm hover-elevate cursor-pointer border-border group overflow-hidden">
              <div className="flex items-stretch">
                {/* Left color bar representing tier */}
                <div className={`w-1.5 shrink-0 ${
                  item.tier === 'T' ? 'bg-tier-t' : 
                  item.tier === 'I' ? 'bg-tier-i' : 
                  item.tier === 'E' ? 'bg-tier-e' : 'bg-tier-r'
                }`} />
                
                <CardContent className="p-4 flex-1 flex flex-col md:flex-row gap-4 justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {item.itemId}
                      </span>
                      <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</h3>
                      {item.temperatureZone && <TempZoneIcon zone={item.temperatureZone} />}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <TierBadge tier={item.tier} />
                      <span className="opacity-50">•</span>
                      <span>{item.category}</span>
                      <span className="opacity-50">•</span>
                      <span>Donor: <span className="font-medium text-foreground">{item.donor}</span></span>
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 mt-2 md:mt-0">
                    <div className="flex items-center gap-2">
                      <ConditionChip condition={item.condition} />
                      <StageChip stage={item.stage} />
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {format(new Date(item.createdAt), 'MM/dd/yy')}
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}