'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  deleteOrg,
  fetchOrgInvites,
  fetchOrgWebhook,
  inviteMember,
  removeMember,
  renameOrg,
  revokeInvite,
  transferOrgOwnership,
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
  const tBoard = useTranslations('board');
  const { activeOrgId, activeOrg, userId, isManager, orgsStatus, retryOrgs } = useApp();

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
  /** 방장 넘기기도 마찬가지다. 넘기고 나면 되돌릴 권한이 나에게 없다 */
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  /** 조직 삭제 — 이 앱에서 유일하게 소프트 삭제가 아닌 지우기라 별도 시트로 묻는다 */
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
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
    onSuccess: invited => {
      setEmail('');
      /*
        **가입한 사람과 아직 아닌 사람은 다른 말을 들어야 한다.**
        이 앱은 초대 메일을 보내지 않는다 — 이미 쓰고 있는 사람은 앱을 열면 곧 보지만,
        가입도 안 한 사람은 알려 주지 않으면 영영 모른다. 같은 "초대했어요"를 띄우면
        방장은 상대가 곧 볼 거라고 믿고 기다리게 된다.
      */
      showMsg(
        invited.registered ? tToast('inviteSent') : tToast('inviteSentUnregistered'),
        invited.registered ? 'success' : 'info'
      );
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

  /*
    초대를 **앱 밖에서** 전하는 길.

    메일을 보내지 않으므로 초대장은 상대가 앱을 열기 전까지 아무 데도 나타나지 않는다.
    그 한 칸을 사람이 메운다 — 보낼 문구와 가입 링크를 한 번에 만들어 준다.

    `navigator.share`가 있으면 시스템 공유 시트를 연다(iOS Safari에 있다 — 카카오톡·문자로
    바로 넘어간다). 없으면 클립보드에 넣는다. 둘 다 안 되면 조용히 실패하지 않고 알린다.

    **링크에 이메일을 싣지 않는다.** 주소창·브라우저 기록·중간 로그에 남을 이유가 없고,
    어차피 문구에 "이 주소로 가입하세요"라고 적혀 있다.
  */
  async function shareInvite(inviteEmail: string) {
    const text = t('inviteShareMessage', {
      org: activeOrg?.name ?? '',
      email: inviteEmail,
      url: `${window.location.origin}/login?mode=signup`,
    });

    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showMsg(tToast('inviteCopied'), 'success');
    } catch (err) {
      // 공유 시트를 사용자가 닫은 것은 실패가 아니다 — 토스트를 띄우면 시끄럽다
      if (err instanceof DOMException && err.name === 'AbortError') return;
      showMsg(tToast('inviteCopyFailed'), 'error');
    }
  }

  function closeManage() {
    setManaging(null);
    setConfirmKick(false);
    setConfirmTransfer(false);
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

  /*
    방장 넘기기.

    내 역할이 바뀌므로 멤버 목록만으로는 부족하고 **조직 목록(`my-orgs`)도 다시 읽어야**
    한다 — 헤더·팀 화면의 "관리자만 보이는 것"이 전부 그 role을 본다.
  */
  const transfer = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await transferOrgOwnership(activeOrgId!, targetId);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: () => {
      showMsg(tToast('ownerTransferred'), 'success');
      closeManage();
      queryClient.invalidateQueries({ queryKey: ['members', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['my-orgs'] });
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  /*
    조직 삭제.

    지우고 나면 지금 보고 있던 조직이 사라진다 — `my-orgs`를 다시 읽으면 `useActiveOrg`가
    남은 조직의 첫 번째로 알아서 떨어진다(조직이 하나도 없으면 ViewPager의 안내 화면).
    그래서 여기서 어떤 조직으로 갈지 직접 고르지 않는다.
  */
  const removeOrg = useMutation({
    mutationFn: async () => {
      const res = await deleteOrg(activeOrgId!);
      if (!res.success) throw new Error(res.error);
    },
    onSuccess: async () => {
      showMsg(tToast('orgDeleted'), 'success');
      setDeleteOrgOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['my-orgs'] });
      router.replace('/board');
      router.refresh();
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

  // 조직 쿼리가 아직 진행 중이거나 실패했을 때는 "조직 없음"이 아니다 —
  // 안 가리면 오래 백그라운드에 뒀다 돌아왔을 때 여기도 얼어붙은 것처럼 보인다.
  if (orgsStatus === 'pending') {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <div className="mx-auto h-6 w-40 animate-pulse-soft rounded-md bg-hairline" />
      </main>
    );
  }

  if (orgsStatus === 'error') {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <h1 className="text-heading-1 text-ink">{tBoard('orgLoadErrorTitle')}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">{tBoard('orgLoadErrorDescription')}</p>
        <Button size="lg" className="mt-6" onClick={retryOrgs}>
          {tBoard('retry')}
        </Button>
      </main>
    );
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
    const isOwner = activeOrg.role === 'owner';
    const canChangeRole = isOwner && !isSelf && m.role !== 'owner';
    // 넘길 수 있는 조건은 역할을 바꿀 수 있는 조건과 같다 — 방장인 내가, 나 아닌 멤버에게.
    const canTransfer = canChangeRole;
    const canRemove = isSelf ? m.role !== 'owner' : isManager && m.role !== 'owner';
    return { isSelf, canChangeRole, canTransfer, canRemove, any: canChangeRole || canRemove };
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
          {/* 메일이 나가지 않는다는 사실을 초대하기 **전에** 말한다 — 보내고 나서 알면 늦다 */}
          <p className="mt-1 text-caption text-ink-faint">{t('inviteNoEmailNotice')}</p>
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
                <li key={inv.id} className="rounded-xl bg-canvas-soft px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink-secondary">
                      {inv.email}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
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
                  </div>

                  {/*
                    **아직 가입하지 않은 사람에게만 뜬다.** 이미 쓰고 있는 사람은 앱을 열면
                    초대장을 보므로 방장이 따로 할 일이 없다 — 모든 줄에 공유 버튼을 달면
                    정작 손이 필요한 줄이 묻힌다.
                  */}
                  {!inv.registered && (
                    <div className="mt-1.5 flex items-center gap-2 border-t border-hairline pt-1.5">
                      <span className="min-w-0 flex-1 text-[12px] text-ink-muted">
                        {t('inviteUnregisteredHint')}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => shareInvite(inv.email)}>
                        {t('inviteShare')}
                      </Button>
                    </div>
                  )}
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

      {/*
        조직 삭제 — **방장만.** 관리자에게도 보이면 안 된다(액션도 SQL도 막지만, 누를 수
        없는 버튼을 띄워 두면 "왜 안 되지"를 눌러 보고서야 알게 된다).

        맨 아래에 둔다. 위는 매일 만지는 설정이고 이건 평생 한 번 누르거나 안 누르는
        버튼이라, 스크롤해 내려온 사람만 만나면 충분하다 — `/me`의 계정 삭제와 같은 자리다.
      */}
      {activeOrg.role === 'owner' && (
        <Card className="p-5">
          <h2 className="text-title text-ink">{t('deleteOrgTitle')}</h2>
          <p className="mt-1.5 text-caption text-ink-muted">{t('deleteOrgDescription')}</p>
          <Button variant="danger" className="mt-4 w-full" onClick={() => setDeleteOrgOpen(true)}>
            {t('deleteOrg')}
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

            {/*
              방장 넘기기 — 역할 변경 바로 뒤, 내보내기 앞이다.
              위 둘은 "이 사람을 어떻게 할까"이고 이건 "조직을 누구에게 맡길까"라 성격이
              다르지만, 되돌릴 수 없는 정도로 줄을 세우면 이 자리가 맞다.
              **넘기고 나면 되돌릴 권한이 나에게 없으므로** 내보내기와 같이 한 번 더 묻는다.
            */}
            {managed.canTransfer &&
              (confirmTransfer ? (
                <div className="rounded-xl border border-hairline bg-canvas-soft p-3">
                  <p className="text-body-sm text-ink">
                    {t('transferConfirmDescription', { name: managing.display_name })}
                  </p>
                  <p className="mt-1.5 text-caption text-ink-muted">{t('transferConfirmDetail')}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setConfirmTransfer(false)}
                    >
                      {t('cancelInvite')}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => transfer.mutate(managing.user_id)}
                      disabled={transfer.isPending}
                    >
                      {t('transferConfirm')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="lg" variant="outline" onClick={() => setConfirmTransfer(true)}>
                  {t('transferOwner')}
                </Button>
              ))}

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

      {/*
        조직 삭제 확인.

        **무슨 일이 벌어지는지 적는다** — "정말 삭제할까요?"만 묻는 창은 누르는 사람이 이미
        아는 것만 되풀이한다. 여기서 답해야 할 질문은 "안에 있던 것은 어떻게 되나"와
        "다른 멤버는 어떻게 되나"다. 조직 이름을 그대로 보여 주는 것도 그 답의 일부다 —
        조직 여러 개를 오가는 사람은 지금 어느 조직에 서 있는지 헷갈릴 수 있다.
      */}
      <BottomSheet
        open={deleteOrgOpen}
        onClose={() => !removeOrg.isPending && setDeleteOrgOpen(false)}
        title={t('deleteOrgTitle')}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-canvas-soft p-3.5">
            <OrgIcon
              name={activeOrg.name}
              imageUrl={activeOrg.image_url}
              seed={activeOrg.id}
              size="sm"
            />
            <span className="min-w-0 truncate text-[15px] font-semibold text-ink">
              {activeOrg.name}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            <li className="text-body-sm text-ink">{t('deleteOrgEffectAll')}</li>
            <li className="text-body-sm text-ink">
              {t('deleteOrgEffectMembers', { count: activeOrg.member_count })}
            </li>
          </ul>
          <p className="text-caption text-danger">{t('deleteOrgIrreversible')}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteOrgOpen(false)}
              disabled={removeOrg.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => removeOrg.mutate()}
              disabled={removeOrg.isPending}
            >
              {removeOrg.isPending ? t('deletingOrg') : t('deleteOrgConfirm')}
            </Button>
          </div>
        </div>
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
