'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchMyInvites } from '@/app/actions/orgs';
import { useActiveOrg } from '@/hooks/useActiveOrg';
import { applyTheme } from '@/app/providers';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AppContextProvider, type OrgWithRole } from './OrgContext';

/**
 * 앱은 보드 한 화면이 전부다.
 * 팀 관리·초대·설정은 자주 쓰는 기능이 아니라서 아바타 메뉴 안으로 넣고,
 * 화면에는 공유 투두만 남긴다.
 */
const MENU = [
  { href: '/team', label: '팀 관리', hint: '멤버 초대·역할' },
  { href: '/invites', label: '받은 초대', hint: '수락 대기 중인 조직' },
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
              <span className="truncate text-[16px] font-semibold tracking-tight text-ink sm:text-[15px]">
                {activeOrg?.name ?? 'todolight'}
              </span>
              <ChevronIcon className="size-4 shrink-0 text-ink-faint" />
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="메뉴"
              className="relative grid size-10 shrink-0 place-items-center rounded-full no-select active:bg-canvas-soft"
            >
              <Avatar
                name={profile?.display_name ?? email ?? '나'}
                color={profile?.avatar_color}
                imageUrl={profile?.avatar_url}
                seed={userId}
                size="sm"
              />
              {pendingCount > 0 && (
                <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full border-2 border-canvas bg-accent" />
              )}
            </button>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      {/* 조직 전환 */}
      <BottomSheet open={orgSheetOpen} onClose={() => setOrgSheetOpen(false)} title="조직">
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
                {item.href === '/invites' && pendingCount > 0 && (
                  <span className="grid min-w-[20px] place-items-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-ink">
                    {pendingCount}
                  </span>
                )}
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
