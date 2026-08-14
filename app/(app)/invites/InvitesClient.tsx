'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyInvites, respondToInvite } from '@/app/actions/orgs';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { formatRelativeDay } from '@/lib/utils';
import { useApp } from '../OrgContext';

export default function InvitesClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { email, selectOrg } = useApp();

  const invites = useQuery({
    queryKey: ['my-invites'],
    queryFn: async () => {
      const res = await fetchMyInvites();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const respond = useMutation({
    mutationFn: async (input: { id: string; accept: boolean }) => {
      const res = await respondToInvite(input.id, input.accept);
      if (!res.success) throw new Error(res.error);
      return { ...res.data, accept: input.accept };
    },
    onSuccess: data => {
      showMsg(data.accept ? '조직에 합류했습니다.' : '초대를 거절했습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-invites'] });
      if (data.accept && data.orgId) {
        selectOrg(data.orgId);
        router.push('/board');
      }
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-heading-2 text-ink">받은 초대</h1>
        <p className="mt-0.5 text-caption text-ink-muted">{email}로 온 초대장입니다.</p>
      </div>

      {invites.isLoading && <Spinner />}

      {invites.data && invites.data.length === 0 && (
        <EmptyState title="받은 초대가 없습니다." hint="방장에게 이 이메일로 초대를 요청하세요." />
      )}

      {(invites.data ?? []).map(inv => (
        <Card key={inv.id} className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">
              {inv.org_name ?? '이름 없는 조직'}
            </p>
            <p className="mt-0.5 text-caption text-ink-muted">
              {inv.inviter_name ?? '누군가'}님이 초대 · {formatRelativeDay(inv.created_at)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => respond.mutate({ id: inv.id, accept: false })}
            disabled={respond.isPending}
          >
            거절
          </Button>
          <Button
            size="sm"
            onClick={() => respond.mutate({ id: inv.id, accept: true })}
            disabled={respond.isPending}
          >
            수락
          </Button>
        </Card>
      ))}
    </main>
  );
}
