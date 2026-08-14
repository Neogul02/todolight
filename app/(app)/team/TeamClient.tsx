'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrgInvites,
  inviteMember,
  removeMember,
  renameOrg,
  revokeInvite,
  updateMemberRole,
} from '@/app/actions/orgs';
import { useOrgMembers } from '@/hooks/useOrgBoard';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Card, EmptyState, Input, Spinner } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { formatRelativeDay } from '@/lib/utils';

const ROLE_LABEL = { owner: '방장', admin: '관리자', member: '팀원' } as const;

export default function TeamClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeOrgId, activeOrg, userId, isManager } = useApp();

  const members = useOrgMembers(activeOrgId);
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');

  const invites = useQuery({
    queryKey: ['org-invites', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const res = await fetchOrgInvites(activeOrgId!);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const invite = useMutation({
    mutationFn: async (value: string) => {
      const res = await inviteMember(activeOrgId!, value);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setEmail('');
      showMsg('초대장을 보냈습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: ['org-invites', activeOrgId] });
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await revokeInvite(id);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-invites', activeOrgId] }),
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const kick = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await removeMember(activeOrgId!, targetId);
      if (!res.success) throw new Error(res.error);
      return targetId;
    },
    onSuccess: targetId => {
      showMsg(targetId === userId ? '조직에서 나왔습니다.' : '멤버를 내보냈습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: ['members', activeOrgId] });
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const changeRole = useMutation({
    mutationFn: async (input: { targetId: string; role: 'admin' | 'member' }) => {
      const res = await updateMemberRole(activeOrgId!, input.targetId, input.role);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      showMsg('역할을 바꿨습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: ['members', activeOrgId] });
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const rename = useMutation({
    mutationFn: async (value: string) => {
      const res = await renameOrg(activeOrgId!, value);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      showMsg('조직 이름을 바꿨습니다.', 'success');
      setOrgName('');
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  if (!activeOrgId || !activeOrg) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <h1 className="text-heading-1 text-ink">조직이 없습니다</h1>
        <Link href="/orgs/new" className="mt-6 inline-block">
          <Button size="lg">조직 만들기</Button>
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 pb-tabbar sm:py-6">
      <div>
        <h1 className="text-heading-2 text-ink">{activeOrg.name}</h1>
        <p className="mt-0.5 text-caption text-ink-muted">
          멤버 {activeOrg.member_count}명 · 내 역할 {ROLE_LABEL[activeOrg.role]}
        </p>
      </div>

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">팀원 초대</h2>
          <p className="mt-1 text-caption text-ink-muted">
            초대할 사람의 이메일을 넣으면, 그 계정으로 로그인했을 때 초대함에 뜹니다.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (email.trim()) invite.mutate(email);
            }}
            className="mt-3 flex gap-2"
          >
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
            />
            <Button type="submit" disabled={invite.isPending}>
              초대
            </Button>
          </form>

          {invites.isLoading && <Spinner className="mt-4" />}
          {(invites.data?.length ?? 0) > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {invites.data!.map(inv => (
                <li
                  key={inv.id}
                  className="flex items-center gap-2 rounded-xl bg-canvas-soft px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink-secondary">
                    {inv.email}
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {formatRelativeDay(inv.created_at)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(inv.id)}
                    disabled={revoke.isPending}
                  >
                    취소
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-title text-ink">멤버</h2>

        {members.isLoading && <Spinner className="mt-4" />}
        {members.data && members.data.length === 0 && (
          <EmptyState title="아직 멤버가 없습니다." />
        )}

        <ul className="mt-3 flex flex-col gap-1">
          {(members.data ?? []).map(m => {
            const isSelf = m.user_id === userId;
            const canChangeRole = activeOrg.role === 'owner' && !isSelf && m.role !== 'owner';
            const canRemove = isSelf ? m.role !== 'owner' : isManager && m.role !== 'owner';

            return (
              // 393px 폭에서 이름·역할·버튼 두 개를 한 줄에 넣으면 전부 뭉갠다 —
              // 모바일에서는 버튼을 아랫줄로 내린다.
              <li
                key={m.user_id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border-b border-hairline px-1 py-3 last:border-b-0 sm:border-b-0 sm:py-2"
              >
                <Avatar name={m.display_name} emoji={m.avatar_emoji} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink sm:text-[14px]">
                    {m.display_name}
                    {isSelf && <span className="ml-1 text-[12px] text-ink-faint">(나)</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-faint">{m.email}</p>
                </div>

                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>

                {(canChangeRole || canRemove) && (
                  <div className="flex w-full gap-1.5 sm:w-auto">
                    {canChangeRole && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-none"
                        onClick={() =>
                          changeRole.mutate({
                            targetId: m.user_id,
                            role: m.role === 'admin' ? 'member' : 'admin',
                          })
                        }
                        disabled={changeRole.isPending}
                      >
                        {m.role === 'admin' ? '관리자 해제' : '관리자로'}
                      </Button>
                    )}

                    {canRemove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 sm:flex-none"
                        onClick={() => kick.mutate(m.user_id)}
                        disabled={kick.isPending}
                      >
                        {isSelf ? '나가기' : '내보내기'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">조직 이름 바꾸기</h2>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (orgName.trim()) rename.mutate(orgName);
            }}
            className="mt-3 flex gap-2"
          >
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder={activeOrg.name}
              maxLength={60}
            />
            <Button type="submit" variant="outline" disabled={rename.isPending || !orgName.trim()}>
              저장
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
