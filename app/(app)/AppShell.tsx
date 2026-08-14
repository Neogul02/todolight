'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchMyInvites, respondToInvite } from '@/app/actions/orgs';
import { useActiveOrg } from '@/hooks/useActiveOrg';
import { applyTheme } from '@/app/providers';
import { Avatar } from '@/components/Avatar';
import { OrgIcon } from '@/components/OrgIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { cn, formatRelativeDay } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AppContextProvider, type OrgWithRole } from './OrgContext';

/**
 * 앱은 보드 한 화면이 전부다.
 * 팀 관리·설정은 자주 쓰는 기능이 아니라서 아바타 메뉴 안으로 넣고, 화면에는 공유 투두만 남긴다.
 * 받은 초대는 결국 "어느 조직을 볼지"의 문제라 별도 탭 없이 조직 시트 안에서 바로 처리한다.
 */
const MENU = [
  { href: '/team', label: '팀 관리', hint: '멤버 초대·역할' },
  { href: '/me', label: '내 설정', hint: '이름·아바타·테마' },
];

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
  const orgIds = useMemo(() => orgs.map(o => o.id), [orgs]);
  const [activeOrgId, selectOrg] = useActiveOrg(orgIds);
  const [orgSheetOpen, setOrgSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? null;
  const onBoard = pathname === '/board';

  useEffect(() => {
    if (profile?.theme) applyTheme(profile.theme);
  }, [profile?.theme]);

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
      showMsg(data.accept ? '조직에 합류했어요.' : '초대를 거절했어요.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-invites'] });
      // 수락한 조직으로 바로 넘어간다 — 수락하고 또 고르게 하면 한 단계가 남는다
      if (data.accept && data.orgId) {
        selectOrg(data.orgId);
        setOrgSheetOpen(false);
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
        openOrgSheet: () => setOrgSheetOpen(true),
        pendingInvites: pendingCount,
        isManager: activeOrg?.role === 'owner' || activeOrg?.role === 'admin',
      }}
    >
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[1400px] items-center gap-1 px-2 sm:px-3">
            {/* 보드가 아닌 화면에서는 되돌아갈 길을 남긴다 */}
            {!onBoard && (
              <Link
                href="/board"
                aria-label="보드로"
                className="grid size-10 shrink-0 place-items-center rounded-xl no-select active:bg-canvas-soft"
              >
                <BackIcon className="size-5 text-ink-secondary" />
              </Link>
            )}

            <button
              type="button"
              onClick={() => setOrgSheetOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left no-select transition-colors active:bg-canvas-soft sm:hover:bg-canvas-soft"
            >
              {activeOrg && (
                <OrgIcon
                  name={activeOrg.name}
                  imageUrl={activeOrg.image_url}
                  seed={activeOrg.id}
                  size="sm"
                />
              )}
              <span className="truncate text-[16px] font-semibold tracking-tight text-ink sm:text-[15px]">
                {activeOrg?.name ?? 'todolight'}
              </span>
              <ChevronIcon className="size-4 shrink-0 text-ink-faint" />
              {/* 받은 초대가 있으면 여기서 알린다 — 초대를 처리하는 곳이 이 시트 안이다 */}
              {pendingCount > 0 && (
                <span
                  className="size-2 shrink-0 rounded-full bg-danger"
                  aria-label={`받은 초대 ${pendingCount}건`}
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="메뉴"
              className="grid size-10 shrink-0 place-items-center rounded-full no-select active:bg-canvas-soft"
            >
              <Avatar
                name={profile?.display_name ?? email ?? '나'}
                color={profile?.avatar_color}
                imageUrl={profile?.avatar_url}
                seed={userId}
                size="sm"
              />
            </button>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      {/* 조직 전환 + 받은 초대 */}
      <BottomSheet open={orgSheetOpen} onClose={() => setOrgSheetOpen(false)} title="조직">
        {pendingCount > 0 && (
          <section className="mb-4">
            <h3 className="flex items-center gap-1.5 px-1 pb-2 text-caption font-semibold text-ink-secondary">
              <span className="size-2 rounded-full bg-danger" />
              받은 초대 {pendingCount}
            </h3>
            <ul className="flex flex-col gap-2">
              {invites.data!.map(inv => (
                <li key={inv.id} className="rounded-xl border border-hairline bg-canvas-soft p-3">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {inv.org_name ?? '이름 없는 조직'}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-muted">
                    {inv.inviter_name ?? '누군가'}님이 초대 · {formatRelativeDay(inv.created_at)}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => respond.mutate({ id: inv.id, accept: false })}
                      disabled={respond.isPending}
                    >
                      거절
                    </Button>
                    <Button
                      size="sm"
                      className="flex-[2]"
                      onClick={() => respond.mutate({ id: inv.id, accept: true })}
                      disabled={respond.isPending}
                    >
                      수락
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ul className="flex flex-col gap-1">
          {orgs.map(o => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  selectOrg(o.id);
                  setOrgSheetOpen(false);
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
                    멤버 {o.member_count}명 ·{' '}
                    {o.role === 'owner' ? '방장' : o.role === 'admin' ? '관리자' : '팀원'}
                  </span>
                </span>
                {o.id === activeOrgId && <CheckIcon className="size-5 shrink-0 text-ink" />}
              </button>
            </li>
          ))}
        </ul>

        <Link
          href="/orgs/new"
          onClick={() => setOrgSheetOpen(false)}
          className="mt-2 flex h-12 items-center justify-center rounded-xl border border-dashed border-hairline-strong text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft"
        >
          + 새 조직 만들기
        </Link>
      </BottomSheet>

      {/* 아바타 메뉴 — 하단 탭바를 없앤 대신 관리 기능을 전부 여기 모았다 */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="메뉴">
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
          로그아웃
        </button>
      </BottomSheet>
    </AppContextProvider>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
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
