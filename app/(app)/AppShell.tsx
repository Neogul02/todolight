'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchMyInvites, respondToInvite } from '@/app/actions/orgs';
import { useActiveOrg } from '@/hooks/useActiveOrg';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { applyTheme } from '@/app/providers';
import { applyLocale, readLocaleCookie } from '@/lib/locale-client';
import { Avatar } from '@/components/Avatar';
import { OrgIcon } from '@/components/OrgIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { cn, formatRelativeDay } from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { Profile } from '@/types/db';
import { AppContextProvider, type BoardMode, type OrgWithRole } from './OrgContext';

export default function AppShell({
  userId,
  email,
  orgs,
  profile,
  children,
}: {
  userId: string;
  email: string | null;
  orgs: OrgWithRole[];
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const t = useTranslations('appshell');
  const tToast = useTranslations('toast');
  const orgIds = useMemo(() => orgs.map(o => o.id), [orgs]);
  const [activeOrgId, selectOrg] = useActiveOrg(orgIds);
  const [menuOpen, setMenuOpen] = useState(false);
  // PC에서는 보드 버튼 자체를 숨겼으니 기본값도 대시보드여야 고를 방법이 있다.
  // 아직 직접 고른 적이 없으면(manualMode === null) 화면 폭으로 기본값을 정한다 —
  // useSyncExternalStore 기반이라 SSR과 어긋나지 않는다(useIsDesktop.ts 참고).
  const isDesktop = useIsDesktop();
  const [manualMode, setManualMode] = useState<BoardMode | null>(null);
  const picked = manualMode ?? (isDesktop ? 'dashboard' : 'board');
  /*
    대시보드는 PC 전용이다. 폰에서는 멤버가 늘수록 세로로 한없이 길어져서
    "누가 무엇을 들고 있나"가 오히려 안 보인다 — 그 일은 좌우로 미는 보드가 이미 한다.
    창을 줄여서 넘어온 경우에도 보드로 떨어뜨린다(버튼이 없어 되돌아갈 길이 없으므로).
  */
  const boardMode: BoardMode = !isDesktop && picked === 'dashboard' ? 'board' : picked;
  const setBoardMode = setManualMode;

  /*
    보드↔달력↔가계부는 예전엔 한 페이지 안의 모드 전환이라 애니메이션이 공짜였는데,
    /calendar를 별도 라우트로 뺀 뒤로는 화면이 뚝 끊겨 바뀌었다 — 라우트가 바뀌어도
    레이아웃(AppShell)은 그대로 남고 children만 바뀌므로, 그 children을 pathname으로
    키를 준 AnimatePresence로 감싸면 라우트 전환에도 보드 안 뷰 전환과 같은 느낌을 줄 수
    있다. mode="wait"인 이유는 BoardClient의 뷰 전환과 같다 — 두 페이지가 겹쳐 있으면
    높이가 서로 달라 화면이 출렁인다. initial={false}는 앱을 처음 열 때도 켠다 — 안 그러면
    첫 진입 때도 페이드인이 걸려서, 흰 화면을 없애려고 들인 공(스켈레톤)이 무색해진다.
  */
  const reduceMotion = useReducedMotion();
  const routeMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const },
      };

  /* 헤더 가운데에 놓는 뷰 전환. 아이콘 모양으로 구분된다 */
  const VIEW_MODES: {
    key: BoardMode;
    label: string;
    Icon: (p: { className?: string }) => React.ReactElement;
  }[] = [
    { key: 'board', label: t('viewBoard'), Icon: BoardViewIcon },
    { key: 'dashboard', label: t('viewDashboard'), Icon: DashboardIcon },
  ];

  /**
   * 앱은 보드 한 화면이 전부다.
   * 팀 관리·설정은 자주 쓰는 기능이 아니라서 아바타 메뉴 안으로 넣고, 화면에는 공유 투두만 남긴다.
   * 받은 초대는 결국 "어느 조직을 볼지"의 문제라 별도 탭 없이 조직 시트 안에서 바로 처리한다.
   */
  const MENU = [
    { href: '/team', label: t('teamLabel'), hint: t('teamHint') },
    { href: '/me', label: t('meLabel'), hint: t('meHint') },
  ];

  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? null;
  const onBoard = pathname === '/board';
  const onCalendar = pathname === '/calendar';
  const onLedger = pathname === '/ledger';
  /*
    보드의 두 뷰, 달력, 가계부는 전부 "매일 들여다보는 화면"이라 같은 세그먼트에 묶어 둔다 —
    달력·가계부는 보드 안의 뷰가 아니라 나란한 별도 라우트라서, 그 화면에 있는 동안 보드
    뷰(보드·대시보드)를 고르면 /board로 돌려보낸다. 안 그러면 모드만 바뀌고 화면은 그대로라
    버튼이 먹통처럼 보인다.
  */
  const showViewSwitch = onBoard || onCalendar || onLedger;
  // 설정에서 끄면 버튼 자체를 감춘다. 다만 이미 /ledger에 있다면 남겨 둔다 —
  // 켜 놓고 들어왔다가 다른 기기에서 끄면 나갈 길이 사라진다.
  const showLedgerButton = (profile?.show_ledger ?? true) || onLedger;

  function pickBoardMode(key: BoardMode) {
    setBoardMode(key);
    if (!onBoard) router.push('/board');
  }

  useEffect(() => {
    if (profile?.theme) applyTheme(profile.theme);
  }, [profile?.theme]);

  // 로그인 직후 등 쿠키가 아직 없거나(기본 'ko') 다른 기기에서 바꾼 값과 어긋날 때만 맞춘다 —
  // 매번 새로고침하면 정상 케이스에서도 깜빡인다.
  useEffect(() => {
    if (!profile?.locale) return;
    if (readLocaleCookie() === profile.locale) return;
    applyLocale(profile.locale);
    router.refresh();
  }, [profile?.locale, router]);

  const invites = useQuery({
    queryKey: ['my-invites'],
    queryFn: async () => {
      const res = await fetchMyInvites();
      return res.success ? res.data : [];
    },
    refetchInterval: 60_000,
  });

  const pendingCount = invites.data?.length ?? 0;

  const respond = useMutation({
    mutationFn: async (input: { id: string; accept: boolean }) => {
      const res = await respondToInvite(input.id, input.accept);
      if (!res.success) throw new Error(res.error);
      return { ...res.data, accept: input.accept };
    },
    onSuccess: data => {
      showMsg(data.accept ? tToast('inviteAccepted') : tToast('inviteDeclined'), 'success');
      queryClient.invalidateQueries({ queryKey: ['my-invites'] });
      // 수락한 조직으로 바로 넘어간다 — 수락하고 또 고르게 하면 한 단계가 남는다
      if (data.accept && data.orgId) {
        selectOrg(data.orgId);
        setMenuOpen(false);
        router.push('/board');
      }
      router.refresh();
    },
    onError: (e: Error) => showMsg(e.message, 'error'),
  });

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const roleLabel = (role: OrgWithRole['role']) =>
    role === 'owner' ? t('roleOwner') : role === 'admin' ? t('roleAdmin') : t('roleMember');

  return (
    <AppContextProvider
      value={{
        userId,
        email,
        profile,
        orgs,
        activeOrgId,
        activeOrg,
        selectOrg,
        openMenu: () => setMenuOpen(true),
        pendingInvites: pendingCount,
        isManager: activeOrg?.role === 'owner' || activeOrg?.role === 'admin',
        boardMode,
        setBoardMode,
      }}
    >
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[1400px] items-center gap-1 px-2 sm:px-3">
            {/*
              보드가 아닌 화면에서는 되돌아갈 길을 남긴다.
              달력·가계부는 예외 — 뷰 세그먼트가 그대로 떠 있어서 거기서 바로 보드로 갈 수 있다.
            */}
            {!onBoard && !onCalendar && !onLedger && (
              <Link
                href="/board"
                aria-label={t('boardBack')}
                className="grid size-10 shrink-0 place-items-center rounded-xl no-select active:bg-canvas-soft"
              >
                <BackIcon className="size-5 text-ink-secondary" />
              </Link>
            )}

            {/*
              조직 전환은 프로필 메뉴로 옮겼다 — 여기를 눌러도 조직은 안 바뀐다.
              대신 로고를 누르면 홈으로 가는 흔한 관례대로 기본 보드로 보낸다 —
              대시보드·달력·팀·설정 어디에 있든 내 할 일 목록으로 돌아오는 가장 짧은 길이다.
              뒤로가기 화살표와 목적지가 같아서 별도 아이콘 없이 이 영역 전체가 그 역할을 겸한다.
            */}
            <Link
              href="/board"
              aria-label={t('boardBack')}
              className="mr-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 no-select transition-colors active:bg-canvas-soft"
            >
              {activeOrg && (
                <OrgIcon
                  name={activeOrg.name}
                  imageUrl={activeOrg.image_url}
                  seed={activeOrg.id}
                  size="sm"
                />
              )}
              <span className="truncate text-[16px] font-semibold tracking-[var(--tracking-headline)] text-ink sm:text-[15px]">
                {activeOrg?.name ?? 'todolight'}
              </span>
            </Link>

            {/* 보드·달력·가계부에서만 뜬다 — 팀·설정 화면에서는 고를 것이 없다 */}
            {showViewSwitch && (
              <div className="flex h-9 shrink-0 overflow-hidden rounded-lg border border-hairline no-select">
                {VIEW_MODES.map(({ key, label, Icon }) => {
                  const active = onBoard && boardMode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickBoardMode(key)}
                      aria-pressed={active}
                      aria-label={label}
                      title={label}
                      className={cn(
                        'grid w-10 place-items-center transition-colors',
                        active ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted',
                        // 보드(가로 캐러셀)와 대시보드(격자)는 "여러 명 보기"로 겹친다 —
                        // 폰에서는 보드만, PC에서는 대시보드만 둔다.
                        key === 'board' && 'sm:hidden',
                        key === 'dashboard' && 'hidden sm:grid'
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </button>
                  );
                })}
                {/*
                  달력·가계부는 보드 안의 뷰가 아니라 나란한 별도 페이지다 —
                  구분선을 하나 넣어 앞의 보드·대시보드 칸과 성격이 다르다는 걸 드러낸다.
                */}
                <Link
                  href="/calendar"
                  aria-label={t('viewCalendar')}
                  title={t('viewCalendar')}
                  aria-current={onCalendar ? 'page' : undefined}
                  className={cn(
                    'grid w-10 place-items-center border-l border-hairline transition-colors',
                    onCalendar ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted'
                  )}
                >
                  <CalendarIcon className="size-[18px]" />
                </Link>
                {showLedgerButton && (
                  <Link
                    href="/ledger"
                    aria-label={t('viewLedger')}
                    title={t('viewLedger')}
                    aria-current={onLedger ? 'page' : undefined}
                    className={cn(
                      'grid w-10 place-items-center border-l border-hairline transition-colors',
                      onLedger ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted'
                    )}
                  >
                    <LedgerIcon className="size-[18px]" />
                  </Link>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t('menu')}
              className="relative ml-0.5 grid size-10 shrink-0 place-items-center rounded-full no-select active:bg-canvas-soft"
            >
              <Avatar
                name={profile?.display_name ?? email ?? '나'}
                color={profile?.avatar_color}
                imageUrl={profile?.avatar_url}
                seed={userId}
                size="sm"
              />
              {/* 초대를 처리하는 곳이 이 메뉴 안이므로 알림도 여기에 붙는다 */}
              {pendingCount > 0 && (
                <span
                  className="absolute right-0.5 top-0.5 size-2.5 rounded-full border-2 border-canvas bg-danger"
                  aria-label={t('pendingInvitesAria', { count: pendingCount })}
                />
              )}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pathname} {...routeMotion} className="flex-1">
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 프로필 메뉴 : 받은 초대 · 조직 전환 · 관리 · 로그아웃을 한 시트에 모았다 */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('menuTitle')}>
        {pendingCount > 0 && (
          <section className="mb-4">
            <h3 className="flex items-center gap-1.5 px-1 pb-2 text-caption font-semibold text-ink-secondary">
              <span className="size-2 rounded-full bg-danger" />
              {t('receivedInvites', { count: pendingCount })}
            </h3>
            <ul className="flex flex-col gap-2">
              {invites.data!.map(inv => (
                <li key={inv.id} className="rounded-xl border border-hairline bg-canvas-soft p-3">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {inv.org_name ?? t('unnamedOrg')}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-muted">
                    {t('inviterLine', {
                      inviter: inv.inviter_name ?? t('someone'),
                      when: formatRelativeDay(inv.created_at, locale),
                    })}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => respond.mutate({ id: inv.id, accept: false })}
                      disabled={respond.isPending}
                    >
                      {t('decline')}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-[2]"
                      onClick={() => respond.mutate({ id: inv.id, accept: true })}
                      disabled={respond.isPending}
                    >
                      {t('accept')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h3 className="px-1 pb-2 text-caption font-semibold text-ink-secondary">{t('orgsTitle')}</h3>
        <ul className="flex flex-col gap-1">
          {orgs.map(o => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  selectOrg(o.id);
                  setMenuOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-canvas-soft',
                  o.id === activeOrgId ? 'bg-canvas-soft' : ''
                )}
              >
                <OrgIcon name={o.name} imageUrl={o.image_url} seed={o.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{o.name}</span>
                  <span className="block text-[12px] text-ink-faint">
                    {t('memberCountRole', { count: o.member_count, role: roleLabel(o.role) })}
                  </span>
                </span>
                {o.id === activeOrgId && <CheckIcon className="size-5 shrink-0 text-ink" />}
              </button>
            </li>
          ))}
        </ul>

        <Link
          href="/orgs/new"
          onClick={() => setMenuOpen(false)}
          className="mt-2 flex h-12 items-center justify-center rounded-xl border border-dashed border-hairline-strong text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft"
        >
          {t('newOrg')}
        </Link>

        <h3 className="px-1 pt-5 pb-2 text-caption font-semibold text-ink-secondary">
          {t('manageTitle')}
        </h3>
        <ul className="flex flex-col gap-1">
          {MENU.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors active:bg-canvas-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{item.label}</span>
                  <span className="block text-[12px] text-ink-faint">{item.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={signOut}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-hairline text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft"
        >
          {t('signOut')}
        </button>
      </BottomSheet>

    </AppContextProvider>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoardViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="7" height="16" rx="1.6" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.6" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="5.5" rx="1.6" />
      <rect x="3.5" y="12.5" width="17" height="7.5" rx="1.6" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  );
}

/* 지폐 — 달력(사각형 + 가로줄 + 위쪽 고리)과 실루엣이 겹치지 않게 가운데를 동그라미로 뚫었다 */
function LedgerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
