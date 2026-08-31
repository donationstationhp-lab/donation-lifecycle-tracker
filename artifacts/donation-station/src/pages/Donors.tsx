import { useState } from 'react';
import { useListDonors, DonorStage, ListDonorsParams } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, AlertCircle, Users } from 'lucide-react';
import { DonorStageChip } from '@/components/shared';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function Donors() {
  const [stageTab, setStageTab] = useState<string>('all');
  const [search, setSearch] = useState('');

  const params: ListDonorsParams = {};
  if (stageTab !== 'all') params.stage = stageTab as DonorStage;
  if (search.trim()) params.search = search;

  const { data: donors, isLoading, isError } = useListDonors(params);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Donors</h1>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search donors..."
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto pb-1 bg-white p-2 rounded-lg border border-border shadow-sm">
        <Tabs value={stageTab} onValueChange={setStageTab} className="w-full">
          <TabsList className="w-full justify-start h-auto p-1 bg-transparent">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-4 py-2">All Donors</TabsTrigger>
            <TabsTrigger value="prospect" className="data-[state=active]:bg-gray-600 data-[state=active]:text-white rounded-md px-4 py-2">Prospect</TabsTrigger>
            <TabsTrigger value="first-gift" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2">First Gift</TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-green-600 data-[state=active]:text-white rounded-md px-4 py-2">Active</TabsTrigger>
            <TabsTrigger value="lapsing" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white rounded-md px-4 py-2">Lapsing</TabsTrigger>
            <TabsTrigger value="lapsed" className="data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-md px-4 py-2">Lapsed</TabsTrigger>
            <TabsTrigger value="reactivated" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md px-4 py-2">Reactivated</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 space-y-3">
        {isLoading && (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="w-10 h-10 rounded-full" />
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
            <p>Failed to load donors.</p>
          </div>
        )}

        {!isLoading && !isError && donors?.length === 0 && (
          <div className="p-12 text-center bg-secondary/30 rounded-xl border border-dashed border-border flex flex-col items-center text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground">No donors found</p>
            <p className="text-sm">Donors appear automatically once an item is logged with their name.</p>
          </div>
        )}

        {!isLoading && donors && donors.map((donor) => (
          <Link key={donor.id} href={`/donors/${donor.id}`}>
            <Card className="shadow-sm hover-elevate cursor-pointer border-border group">
              <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{donor.name}</h3>
                    {donor.organization && (
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {donor.organization}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{donor.giftCount} {donor.giftCount === 1 ? 'gift' : 'gifts'}</span>
                    {donor.contact && (
                      <>
                        <span className="opacity-50">•</span>
                        <span>{donor.contact}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 mt-2 md:mt-0">
                  <DonorStageChip stage={donor.stage} />
                  <div className="text-xs text-muted-foreground font-mono">
                    {donor.lastGiftAt ? `Last gift ${format(new Date(donor.lastGiftAt), 'MM/dd/yy')}` : 'No gifts yet'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
