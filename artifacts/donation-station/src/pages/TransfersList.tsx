import { useState, useMemo } from 'react';
import { useListTransfers, useListAccounts, useListItems, useListClaims, TransferStatus, ListTransfersParams, ListTransfersStatus } from '@workspace/api-client-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export function TransferStatusBadge({ status }: { status: TransferStatus | string }) {
  const variants: Record<string, string> = {
    planned: 'bg-blue-100 text-blue-800 border-blue-200',
    released: 'bg-amber-100 text-amber-800 border-amber-200',
    received: 'bg-green-100 text-green-800 border-green-200',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  
  return (
    <Badge variant="outline" className={`capitalize ${variants[status] || ''}`}>
      {status}
    </Badge>
  );
}

export default function TransfersList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListTransfersStatus | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [claimFilter, setClaimFilter] = useState<string>('all');
  
  const params: ListTransfersParams = {};
  if (statusFilter !== 'all') params.status = statusFilter;
  if (accountFilter !== 'all') params.accountId = accountFilter;
  if (itemFilter !== 'all') params.itemId = itemFilter;
  if (claimFilter !== 'all') params.claimId = claimFilter;
  
  const { data: transfers, isLoading: transfersLoading, isError } = useListTransfers(params);
  const { data: accounts } = useListAccounts();
  const { data: items } = useListItems();
  const { data: claims } = useListClaims();
  
  const accountMap = useMemo(() => {
    if (!accounts) return {};
    return accounts.reduce((acc, a) => ({ ...acc, [a.id]: a }), {} as Record<string, any>);
  }, [accounts]);

  const itemMap = useMemo(() => {
    if (!items) return {};
    return items.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, any>);
  }, [items]);

  const filteredTransfers = useMemo(() => {
    if (!transfers) return [];
    if (!search.trim()) return transfers;
    
    const lowerSearch = search.toLowerCase();
    return transfers.filter(t => {
      const account = accountMap[t.accountId];
      const item = itemMap[t.itemId];
      
      const accountMatch = account?.name.toLowerCase().includes(lowerSearch);
      const itemMatch = item?.name.toLowerCase().includes(lowerSearch) || item?.itemId.toLowerCase().includes(lowerSearch);
      
      return accountMatch || itemMatch;
    });
  }, [transfers, accountMap, itemMap, search]);

  const isLoading = transfersLoading;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transfers</h1>
          <p className="text-muted-foreground text-sm">Chain of custody for approved claims.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 w-full">
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
            
            <Select value={claimFilter} onValueChange={(val: any) => setClaimFilter(val)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="Claim" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Claims</SelectItem>
                {claims?.map(claim => (
                  <SelectItem key={claim.id} value={claim.id}>{claim.id.substring(0,8)}...</SelectItem>
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
                    <p className="font-medium">Error loading transfers</p>
                    <p className="text-xs mt-1">Please try again or check your connection.</p>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && filteredTransfers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <ArrowRightLeft className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-foreground">No transfers found</p>
                    <p className="text-xs mt-1">Transfers are initiated from approved claims.</p>
                  </td>
                </tr>
              )}
              
              {!isLoading && !isError && filteredTransfers.map(transfer => {
                const account = accountMap[transfer.accountId];
                const item = itemMap[transfer.itemId];
                
                return (
                  <tr key={transfer.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {format(new Date(transfer.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{account?.name || transfer.accountId.substring(0,8)}</div>
                      {account?.type && <div className="text-xs text-muted-foreground capitalize">{account.type}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{item?.name || transfer.itemId.substring(0,8)}</div>
                      {item?.itemId && <div className="text-xs text-muted-foreground font-mono">{item.itemId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <TransferStatusBadge status={transfer.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/transfers/${transfer.id}`}>
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
    </div>
  );
}
