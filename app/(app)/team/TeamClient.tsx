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

/**
 * 팀 화면 — 초대 · 멤버 · 조직 설정, 카드 세 장.
 *
 * 조직 설정(아이콘·이름·Discord)은 원래 카드 세 장에 나뉘어 있었다. 셋 다 방장만 보고,
 * 셋 다 "이 조직이 어떻게 보이고 어디로 알림이 가나"라는 한 가지 얘기라 한 장으로 합쳤다.
 * 저장 버튼도 하나면 된다 — 세 개가 각자 있으면 무엇이 저장됐는지 매번 헤아려야 한다.
 */
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
  /** 관리 동작을 여는 멤버. 목록에 버튼을 늘어놓지 않고 누른 사람 것만 시트로 연다 */
  const [managing, setManaging] = useState<MemberSummary | null>(null);
  /** 내보내기는 되돌릴 수 없다 — 시트 안에서 한 번 더 확인받는다 */
  const [confirmKick, setConfirmKick] = useState(false);
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

  function closeManage() {
    setManaging(null);
    setConfirmKick(false);
  }

  const kick = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await removeMember(activeOrgId!, targetId);
      if (!res.success) throw new Error(res.error);
      return targetId;
    },
    onSuccess: targetId => {
      showMsg(targetId === userId ? tToast('leftOrg') : tToast('memberRemoved'), 'success');
      closeManage();
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
      closeManage();
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-webhook', activeOrgId] }),
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  const rename = useMutation({
    mutationFn: async (value: string) => {
      const res = await renameOrg(activeOrgId!, value);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      setOrgName('');
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  /*
    이름과 웹훅을 한 버튼으로 저장한다. 건드리지 않은 항목은 보내지 않는다 —
    빈 이름으로 덮어쓰거나, 이름만 바꿨는데 웹훅까지 다시 쓰는 일이 없어야 한다.
  */
  const savingOrg = rename.isPending || saveWebhook.isPending;
  const nameChanged = orgName.trim().length > 0 && orgName.trim() !== activeOrg?.name;
  const webhookChanged = webhook !== null && webhook !== (savedWebhook.data ?? '');

  async function saveOrgSettings() {
    if (savingOrg) return;
    if (nameChanged) await rename.mutateAsync(orgName.trim());
    if (webhookChanged) await saveWebhook.mutateAsync(webhook!);
    showMsg(tCommon('saved'), 'success');
  }

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

  const canManage = (m: MemberSummary) => {
    const isSelf = m.user_id === userId;
    const canChangeRole = activeOrg.role === 'owner' && !isSelf && m.role !== 'owner';
    const canRemove = isSelf ? m.role !== 'owner' : isManager && m.role !== 'owner';
    return { isSelf, canChangeRole, canRemove, any: canChangeRole || canRemove };
  };

  const managed = managing ? canManage(managing) : null;

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 pb-safe sm:py-6">
      <div className="flex items-center gap-3">
        <OrgIcon name={activeOrg.name} imageUrl={activeOrg.image_url} seed={activeOrg.id} size="lg" />
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

        {/*
          목록에는 사람만 둔다. 역할 변경·내보내기 버튼을 행마다 늘어놓으면 멤버가 늘수록
          목록이 버튼밭이 되고, 되돌릴 수 없는 빨간 버튼이 늘 떠 있게 된다 —
          누른 사람 것만 시트로 연다.
        */}
        <ul className="mt-3 flex flex-col">
          {(members.data ?? []).map(m => {
            const { isSelf, any } = canManage(m);
            return (
              <li key={m.user_id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  disabled={!any}
                  onClick={() => setManaging(m)}
                  className="flex w-full items-center gap-2.5 px-1 py-3 text-left transition-colors active:bg-canvas-soft disabled:active:bg-transparent sm:py-2.5"
                >
                  <Avatar
                    name={m.display_name}
                    color={m.avatar_color}
                    imageUrl={m.avatar_url}
                    seed={m.user_id}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink sm:text-[14px]">
                      {m.display_name}
                      {isSelf && <span className="ml-1 text-[12px] text-ink-faint">{t('you')}</span>}
                    </span>
                    <span className="block truncate text-[12px] text-ink-faint">{m.email}</span>
                  </span>
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                  {any && <ChevronIcon className="size-4 shrink-0 text-ink-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {isManager && (
        <Card className="p-5">
          <h2 className="text-title text-ink">{t('orgSettingsTitle')}</h2>

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

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-caption font-medium text-ink-secondary">{t('renameTitle')}</span>
            <Input
              value={orgName || activeOrg.name}
              onChange={e => setOrgName(e.target.value)}
              enterKeyHint="done"
              maxLength={60}
            />
          </label>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-caption font-medium text-ink-secondary">{t('discordTitle')}</span>
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={webhook ?? savedWebhook.data ?? ''}
              onChange={e => setWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <span className="text-caption text-ink-faint">{t('discordDescription')}</span>
          </label>

          <Button
            className="mt-4 w-full"
            onClick={saveOrgSettings}
            disabled={savingOrg || (!nameChanged && !webhookChanged)}
          >
            {tCommon('save')}
          </Button>
        </Card>
      )}

      {/* 멤버 관리 — 역할 변경과 내보내기. 내보내기는 여기서 한 번 더 확인받는다 */}
      <BottomSheet
        open={!!managing}
        onClose={closeManage}
        title={managing?.display_name ?? ''}
      >
        {managing && managed && (
          <div className="flex flex-col gap-2">
            {managed.canChangeRole && (
              <Button
                size="lg"
                variant="outline"
                onClick={() =>
                  changeRole.mutate({
                    targetId: managing.user_id,
                    role: managing.role === 'admin' ? 'member' : 'admin',
                  })
                }
                disabled={changeRole.isPending}
              >
                {managing.role === 'admin' ? t('demoteAdmin') : t('promoteAdmin')}
              </Button>
            )}

            {managed.canRemove &&
              (confirmKick && !managed.isSelf ? (
                <div className="rounded-xl border border-hairline bg-canvas-soft p-3">
                  <p className="text-body-sm text-ink">
                    {t('kickConfirmDescription', { name: managing.display_name })}
                  </p>
                  <p className="mt-1.5 text-caption text-ink-muted">{t('kickConfirmDetail')}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setConfirmKick(false)}>
                      {t('cancelInvite')}
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => kick.mutate(managing.user_id)}
                      disabled={kick.isPending}
                    >
                      {t('kick')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="lg"
                  variant={managed.isSelf ? 'outline' : 'danger'}
                  onClick={() =>
                    managed.isSelf ? kick.mutate(managing.user_id) : setConfirmKick(true)
                  }
                  disabled={kick.isPending}
                >
                  {managed.isSelf ? t('leave') : t('kick')}
                </Button>
              ))}
          </div>
        )}
      </BottomSheet>
    </main>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 멤버 목록 자리를 미리 잡아 둔다.
 * 스피너는 크기가 없어서 목록이 도착하는 순간 화면이 통째로 밀린다 —
 * 실제 행과 같은 높이를 미리 차지해야 자리가 흔들리지 않는다.
 */
function MemberRowsSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <ul className="mt-3 flex flex-col" aria-busy="true" aria-label={loadingLabel}>
      {[0, 1, 2].map(i => (
        <li key={i} className="flex items-center gap-2.5 px-1 py-3 sm:py-2.5">
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
