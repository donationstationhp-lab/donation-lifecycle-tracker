import { useState, useMemo } from 'react';
import { useListClaims, useListAccounts, useListItems, ClaimStatus, ListClaimsParams, ListClaimsStatus, ListClaimsItemStage } from '@workspace/api-client-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, FileText, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { CreateClaimDialog } from '@/components/claims/CreateClaimDialog';

export function ClaimStatusBadge({ status }: { status: ClaimStatus | string }) {
  const variants: Record<string, string> = {
    submitted: 'bg-blue-100 text-blue-800 border-blue-200',
    verified: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    fulfilled: 'bg-gray-100 text-gray-800 border-gray-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  
  return (
    <Badge variant="outline" className={`capitalize ${variants[status] || ''}`}>
      {status}
    </Badge>
  );
}

export default function ClaimsList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListClaimsStatus | 'all'>('all');
  const [stageFilter, setStageFilter] = useState<ListClaimsItemStage | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const params: ListClaimsParams = {};
  if (statusFilter !== 'all') params.status = statusFilter;
  if (stageFilter !== 'all') params.itemStage = stageFilter;
  if (accountFilter !== 'all') params.accountId = accountFilter;
  if (itemFilter !== 'all') params.itemId = itemFilter;

  const { data: claims, isLoading: claimsLoading, isError } = useListClaims(params);
  const { data: accounts } = useListAccounts();
  const { data: items } = useListItems();
  
  const accountMap = useMemo(() => {
    if (!accounts) return {};
    return accounts.reduce((acc, a) => ({ ...acc, [a.id]: a }), {} as Record<string, any>);
  }, [accounts]);

  const itemMap = useMemo(() => {
    if (!items) return {};
    return items.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, any>);
  }, [items]);

  const filteredClaims = useMemo(() => {
    if (!claims) return [];
    if (!search.trim()) return claims;
    
    const lowerSearch = search.toLowerCase();
    return claims.filter(c => {
      const account = accountMap[c.accountId];
      const item = itemMap[c.itemId];
      
      const accountMatch = account?.name.toLowerCase().includes(lowerSearch);
      const itemMatch = item?.name.toLowerCase().includes(lowerSearch) || item?.itemId.toLowerCase().includes(lowerSearch);
      
      return accountMatch || itemMatch;
    });
  }, [claims, accountMap, itemMap, search]);

  const isLoading = claimsLoading;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claims</h1>
          <p className="text-muted-foreground text-sm">Manage item requests and eligibility verification.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 w-full">
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-[130px] bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={stageFilter} onValueChange={(val: any) => setStageFilter(val)}>
              <SelectTrigger className="w-[130px] bg-white">
                <SelectValue placeholder="Item Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="intake">Intake</SelectItem>
                <SelectItem value="qc">QC</SelectItem>
                <SelectItem value="storage">Storage</SelectItem>
                <SelectItem value="distributed">Distributed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={accountFilter} onValueChange={(val: any) => setAccountFilter(val)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts?.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={itemFilter} onValueChange={(val: any) => setItemFilter(val)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="Item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {items?.map(item => (
                  <SelectItem key={item.id} value={item.id}>{item.itemId}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-full sm:flex-1 sm:min-w-[150px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                type="search" 
                placeholder="Search..." 
                className="pl-9 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
            <Plus className="w-4 h-4 mr-2" />
            New Claim
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                  <td className="px-4 py-3 text-right"><Skeleton className="h-8 w-20 ml-auto" /></td>
                </tr>
              ))}
              
              {isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-red-600 bg-red-50/50">
                    <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Error loading claims</p>
                    <p className="text-xs mt-1">Please try again or check your connection.</p>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && filteredClaims.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-foreground">No claims found</p>
                    <p className="text-xs mt-1">Adjust your search or create a new claim.</p>
                  </td>
                </tr>
              )}
              
              {!isLoading && !isError && filteredClaims.map(claim => {
                const account = accountMap[claim.accountId];
                const item = itemMap[claim.itemId];
                
                return (
                  <tr key={claim.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {format(new Date(claim.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{account?.name || claim.accountId.substring(0,8)}</div>
                      {account?.type && <div className="text-xs text-muted-foreground capitalize">{account.type}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{item?.name || claim.itemId.substring(0,8)}</div>
                      {item?.itemId && <div className="text-xs text-muted-foreground font-mono">{item.itemId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <ClaimStatusBadge status={claim.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/claims/${claim.id}`}>
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                          View Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      
      <CreateClaimDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        accounts={accounts || []} 
        items={items || []} 
      />
    </div>
  );
}