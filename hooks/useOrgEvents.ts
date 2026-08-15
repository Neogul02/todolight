'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  createOrgEvent,
  deleteOrgEvent,
  fetchOrgEvents,
  updateOrgEvent,
} from '@/app/actions/events';
import { showMsg } from '@/lib/toast';
import type { OrgEvent } from '@/types/db';

export const eventKeys = {
  all: (orgId: string) => ['org-events', orgId] as const,
};

export function useOrgEvents(orgId: string | null) {
  return useQuery({
    queryKey: eventKeys.all(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async (): Promise<OrgEvent[]> => {
      const res = await fetchOrgEvents(orgId!);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });
}

/**
 * 일정 쓰기.
 * 할 일과 달리 낙관적으로 그리지 않는다 — 하루에 몇 번 만들지 않는 데다,
 * 기간이 바뀌면 달력 띠 배치가 통째로 달라져서 되돌릴 때 화면이 더 어지럽다.
 */
export function useEventMutations(orgId: string | null) {
  const queryClient = useQueryClient();
  const t = useTranslations('toast');
  const key = eventKeys.all(orgId ?? '');
  const resync = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      color: string;
      startDate: string;
      endDate: string;
    }) => {
      const res = await createOrgEvent({ orgId: orgId!, ...input });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      showMsg(t('eventCreated'), 'success');
      resync();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const update = useMutation({
    mutationFn: async (input: {
      eventId: string;
      title?: string;
      color?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const { eventId, ...patch } = input;
      const res = await updateOrgEvent(eventId, patch);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      showMsg(t('eventUpdated'), 'success');
      resync();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await deleteOrgEvent(eventId);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      showMsg(t('eventDeleted'), 'success');
      resync();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  return { create, update, remove };
}
