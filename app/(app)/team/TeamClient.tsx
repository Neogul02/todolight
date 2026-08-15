'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  fetchOrgInvites,
  fetchOrgWebhook,
  inviteMember,
  removeMember,
  renameOrg,
  revokeInvite,
  updateMemberRole,
  updateOrgImage,
  updateOrgWebhook,
} from '@/app/actions/orgs';
import { removeOrgImage, uploadOrgImage } from '@/lib/image-upload';
import { useOrgMembers } from '@/hooks/useOrgBoard';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { OrgIcon } from '@/components/OrgIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { formatRelativeDay } from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { MemberSummary } from '@/types/db';

export default function TeamClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const t = useTranslations('team');
  const tToast = useTranslations('toast');
  const tRole = useTranslations('appshell');
  const tCommon = useTranslations('common');
  const { activeOrgId, activeOrg, userId, isManager } = useApp();

  const ROLE_LABEL = {
    owner: tRole('roleOwner'),
    admin: tRole('roleAdmin'),
    member: tRole('roleMember'),
  } as const;

  const members = useOrgMembers(activeOrgId);
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [webhook, setWebhook] = useState<string | null>(null);
  // 내보내기는 되돌릴 수 없다 — 빨간 버튼 하나로 끝내지 않고 시트에서 한 번 더 확인받는다
  const [pendingKick, setPendingKick] = useState<MemberSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const orgFileRef = useRef<HTMLInputElement | null>(null);

  // 아이콘도 아바타와 같게 — 고르는 즉시 올리고 반영한다
  async function pickOrgImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeOrgId || uploading) return;

    setUploading(true);
    try {
      const url = await uploadOrgImage(activeOrgId, file);
      const res = await updateOrgImage(activeOrgId, url);
      if (!res.success) throw new Error(res.error);
      showMsg(tToast('orgImageChanged'), 'success');
      router.refresh();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function clearOrgImage() {
    if (!activeOrgId || uploading) return;
    setUploading(true);
    try {
      await removeOrgImage(activeOrgId);
      const res = await updateOrgImage(activeOrgId, null);
      if (!res.success) throw new Error(res.error);
      showMsg(tToast('orgImageRemoved'), 'success');
      router.refresh();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  }

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
      showMsg(tToast('inviteSent'), 'success');
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
      showMsg(targetId === userId ? tToast('leftOrg') : tToast('memberRemoved'), 'success');
      setPendingKick(null);
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
      showMsg(tToast('roleChanged'), 'success');
      queryClient.invalidateQueries({ queryKey: ['members', activeOrgId] });
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  // 저장된 웹훅을 불러와 입력창 초기값으로 쓴다 (아직 안 건드렸으면 null)
  const savedWebhook = useQuery({
    queryKey: ['org-webhook', activeOrgId],
    enabled: !!activeOrgId && isManager,
    queryFn: async () => {
      const res = await fetchOrgWebhook(activeOrgId!);
      if (!res.success) throw new Error(res.error);
      return res.data ?? '';
    },
  });

  const saveWebhook = useMutation({
    mutationFn: async (value: string) => {
      const res = await updateOrgWebhook(activeOrgId!, value);
      if (!res.success) throw new Error(res.error);
      return value;
    },
    onSuccess: value => {
      showMsg(value ? tToast('discordOn') : tToast('discordOff'), 'success');
      queryClient.invalidateQueries({ queryKey: ['org-webhook', activeOrgId] });
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const rename = useMutation({
    mutationFn: async (value: string) => {
      const res = await renameOrg(activeOrgId!, value);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      showMsg(tToast('orgRenamed'), 'success');
      setOrgName('');
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  if (!activeOrgId || !activeOrg) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <h1 className="text-heading-1 text-ink">{t('noOrgTitle')}</h1>
        <Link href="/orgs/new" className="mt-6 inline-block">
          <Button size="lg">{t('createOrg')}</Button>
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 pb-safe sm:py-6">
      <div className="flex items-center gap-3">
        <OrgIcon
          name={activeOrg.name}
          imageUrl={activeOrg.image_url}
          seed={activeOrg.id}
          size="lg"
        />
        <div className="min-w-0">
          <h1 className="truncate text-heading-2 text-ink">{activeOrg.name}</h1>
          <p className="mt-0.5 text-caption text-ink-muted">
            {t('memberCount', { count: activeOrg.member_count })}
          </p>
        </div>
      </div>

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">{t('inviteTitle')}</h2>
          <p className="mt-1 text-caption text-ink-muted">{t('inviteDescription')}</p>
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
              {t('inviteButton')}
            </Button>
          </form>

          {invites.isLoading && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {[0, 1].map(i => (
                <li key={i} className="h-11 rounded-xl bg-canvas-soft animate-pulse-soft" />
              ))}
            </ul>
          )}
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
                    {formatRelativeDay(inv.created_at, locale)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(inv.id)}
                    disabled={revoke.isPending}
                  >
                    {t('cancelInvite')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-title text-ink">{t('membersTitle')}</h2>

        {members.isLoading && <MemberRowsSkeleton loadingLabel={t('loadingMembers')} />}
        {members.data && members.data.length === 0 && <EmptyState title={t('noMembers')} />}

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
                <Avatar
                  name={m.display_name}
                  color={m.avatar_color}
                  imageUrl={m.avatar_url}
                  seed={m.user_id}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink sm:text-[14px]">
                    {m.display_name}
                    {isSelf && <span className="ml-1 text-[12px] text-ink-faint">{t('you')}</span>}
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
                        {m.role === 'admin' ? t('demoteAdmin') : t('promoteAdmin')}
                      </Button>
                    )}

                    {canRemove && (
                      <Button
                        size="sm"
                        variant={isSelf ? 'outline' : 'danger'}
                        className="flex-1 sm:flex-none"
                        onClick={() => (isSelf ? kick.mutate(m.user_id) : setPendingKick(m))}
                        disabled={kick.isPending}
                      >
                        {isSelf ? t('leave') : t('kick')}
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
          <h2 className="text-title text-ink">{t('discordTitle')}</h2>
          <p className="mt-1 text-caption text-ink-muted">{t('discordDescription')}</p>
          <form
            onSubmit={e => {
              e.preventDefault();
              saveWebhook.mutate(webhook ?? savedWebhook.data ?? '');
            }}
            className="mt-3 flex flex-col gap-2 sm:flex-row"
          >
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={webhook ?? savedWebhook.data ?? ''}
              onChange={e => setWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <Button type="submit" variant="outline" disabled={saveWebhook.isPending}>
              {tCommon('save')}
            </Button>
          </form>
        </Card>
      )}

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">{t('orgImageTitle')}</h2>
          <p className="mt-1 text-caption text-ink-muted">{t('orgImageDescription')}</p>
          <input
            ref={orgFileRef}
            type="file"
            accept="image/*"
            onChange={pickOrgImage}
            className="hidden"
          />
          <div className="mt-3 flex items-center gap-3">
            <OrgIcon
              name={activeOrg.name}
              imageUrl={activeOrg.image_url}
              seed={activeOrg.id}
              size="lg"
            />
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => orgFileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t('uploading') : activeOrg.image_url ? t('changeImage') : t('uploadImage')}
            </Button>
            {activeOrg.image_url && (
              <Button variant="ghost" onClick={clearOrgImage} disabled={uploading}>
                {tCommon('delete')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">{t('renameTitle')}</h2>
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
              {tCommon('save')}
            </Button>
          </form>
        </Card>
      )}
      <BottomSheet
        open={!!pendingKick}
        onClose={() => setPendingKick(null)}
        title={t('kickSheetTitle')}
      >
        <p className="text-body-sm text-ink">
          {t('kickConfirmDescription', {
            name: pendingKick?.display_name ?? '',
          })}
        </p>
        <p className="mt-1.5 text-caption text-ink-muted">{t('kickConfirmDetail')}</p>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setPendingKick(null)}>
            {t('cancelInvite')}
          </Button>
          <Button
            variant="danger"
            onClick={() => pendingKick && kick.mutate(pendingKick.user_id)}
            disabled={kick.isPending}
          >
            {t('kick')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}

/**
 * 멤버 목록 자리를 미리 잡아 둔다.
 * 스피너는 크기가 없어서 목록이 도착하는 순간 화면이 통째로 밀린다 —
 * 실제 행과 같은 높이를 미리 차지해야 자리가 흔들리지 않는다.
 */
function MemberRowsSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <ul className="mt-3 flex flex-col gap-1" aria-busy="true" aria-label={loadingLabel}>
      {[0, 1, 2].map(i => (
        <li key={i} className="flex items-center gap-2.5 px-1 py-3 sm:py-2">
          <span className="size-8 shrink-0 rounded-full bg-canvas-soft animate-pulse-soft" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-24 rounded-md bg-canvas-soft animate-pulse-soft" />
            <span className="h-3 w-36 rounded-md bg-canvas-soft animate-pulse-soft" />
          </span>
          <span className="h-5 w-10 rounded-full bg-canvas-soft animate-pulse-soft" />
        </li>
      ))}
    </ul>
  );
}
