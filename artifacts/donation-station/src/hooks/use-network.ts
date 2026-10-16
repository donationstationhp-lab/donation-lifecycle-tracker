import { useQueryClient } from '@tanstack/react-query';
import { useGetNetwork, useSaveNetwork, getGetNetworkQueryKey } from '@workspace/api-client-react';
import type { NetworkSnapshot } from '@workspace/api-client-react';

export function useNetwork() {
  return useGetNetwork({
    query: { queryKey: getGetNetworkQueryKey(), refetchOnMount: 'always', refetchInterval: 30000 },
  });
}

export function useNetworkCommand() {
  const qc = useQueryClient();
  return useSaveNetwork({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetNetworkQueryKey() }),
    },
  });
}

export function errMsg(e: unknown): string {
  const x = e as { message?: string; data?: { error?: string } } | null;
  return x?.data?.error || x?.message || 'Request failed';
}

export type Snapshot = NetworkSnapshot;
