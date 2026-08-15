'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeClient } from '@/lib/supabase-realtime';
import {
  createLedgerEntry,
  deleteLedgerEntry,
  fetchLedgerEntries,
} from '@/app/actions/ledger';
import { showMsg } from '@/lib/toast';
import type { LedgerEntry } from '@/types/db';

export const ledgerKeys = {
  /** 캐시는 달 단위다 — 달을 넘기면 그 달만 새로 읽는다 */
  month: (orgId: string, month: string) => ['ledger', orgId, month] as const,
  org: (orgId: string) => ['ledger', orgId] as const,
};

export function useLedgerEntries(orgId: string | null, month: string) {
  return useQuery({
    queryKey: ledgerKeys.month(orgId ?? '', month),
    enabled: !!orgId,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const res = await fetchLedgerEntries(orgId!, month);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });
}

/**
 * 조직의 지출 변경을 웹소켓으로 받는다.
 * 보드처럼 행을 캐시에 직접 병합하지 않고 조직 전체를 invalidate한다 — 들어온 행이
 * 지금 보고 있는 달인지 판정해야 하는데, 그 분기를 캐시 병합 안에 넣으면 달을 넘길 때마다
 * 어긋날 거리가 하나 늘어난다. 한 달치는 몇십 줄이라 다시 읽는 비용이 싸다.
 */
export function useLedgerRealtime(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const supabase = getRealtimeClient();
    const channel = supabase
      .channel(`ledger-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ledger_entries', filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ledgerKeys.org(orgId) })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}

/**
 * 지출 추가·삭제.
 * 낙관적 반영은 하지 않는다 — 할 일 체크와 달리 한 손가락으로 연타하는 동작이 아니고,
 * 합계가 잠깐이라도 틀린 값을 보여 주는 쪽이 200ms 기다리는 것보다 나쁘다.
 */
export function useLedgerMutations(orgId: string | null, month: string) {
  const queryClient = useQueryClient();

  const invalidateMonth = () => {
    if (orgId) queryClient.invalidateQueries({ queryKey: ledgerKeys.month(orgId, month) });
  };
  const invalidateOrg = () => {
    if (orgId) queryClient.invalidateQueries({ queryKey: ledgerKeys.org(orgId) });
  };

  const add = useMutation({
    mutationFn: async (input: { amount: number; title: string; spentOn: string; payerId?: string }) => {
      const res = await createLedgerEntry({ orgId: orgId!, ...input });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    // 날짜 피커가 보고 있는 달 안으로 제한돼 있어서 다른 달로 새는 경우는 없다 —
    // 그래도 org 단위로 무효화한다. 실시간으로 남이 다른 달에 적은 것도 같이 맞춰진다.
    onSuccess: invalidateOrg,
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteLedgerEntry(id);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidateMonth,
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  return { add, remove };
}
