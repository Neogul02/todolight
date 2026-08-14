'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchMyInvites } from '@/app/actions/orgs';
import { useActiveOrg } from '@/hooks/useActiveOrg';
import { applyTheme } from '@/app/providers';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AppContextProvider, type OrgWithRole } from './OrgContext';

const NAV = [
  { href: '/board', label: '보드', icon: BoardIcon },
  { href: '/team', label: '팀', icon: TeamIcon },
  { href: '/invites', label: '초대', icon: InviteIcon },
  { href: '/me', label: '내 설정', icon: MeIcon },
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
  const pathname = usePathname();
  const orgIds = useMemo(() => orgs.map(o => o.id), [orgs]);
  const [activeOrgId, selectOrg] = useActiveOrg(orgIds);
  const [orgSheetOpen, setOrgSheetOpen] = useState(false);

  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? null;

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
        {/* ── 헤더 : 모바일은 한 줄로 끝낸다 (852px 중 두 줄은 사치) ── */}
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[1400px] items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              onClick={() => setOrgSheetOpen(true)}
              className="flex min-w-0 max-w-[60%] items-center gap-1.5 rounded-xl px-2 py-1.5 text-left no-select transition-colors active:bg-canvas-soft sm:hover:bg-canvas-soft"
            >
              <span className="truncate text-[16px] font-semibold tracking-tight text-ink sm:text-[15px]">
                {activeOrg?.name ?? 'todolight'}
              </span>
              <ChevronIcon className="size-4 shrink-0 text-ink-faint" />
            </button>

            {/* 데스크톱 전용 상단 네비 — 모바일은 하단 탭바가 대신한다 */}
            <nav className="ml-2 hidden items-center gap-0.5 sm:flex">
              {NAV.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[13px] font-medium no-select transition-colors',
                    pathname.startsWith(item.href)
                      ? 'bg-canvas-soft text-ink'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {item.label}
                  {item.href === '/invites' && pendingCount > 0 && (
                    <span className="ml-1 text-accent">·{pendingCount}</span>
                  )}
                </Link>
              ))}
            </nav>

            <Link
              href="/me"
              aria-label="내 설정"
              className="ml-auto grid size-10 shrink-0 place-items-center rounded-full no-select active:bg-canvas-soft sm:size-9"
            >
              <Avatar
                name={profile?.display_name ?? email ?? '나'}
                emoji={profile?.avatar_emoji}
                size="sm"
              />
            </Link>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        {/* ── 하단 탭바 : iOS 관례. 세이프 에어리어만큼 아래를 띄운다 ── */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas/92 pb-safe backdrop-blur-md sm:hidden">
          <ul className="flex h-[var(--tabbar-h)] items-stretch">
            {NAV.map(item => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    className={cn(
                      'relative flex h-full flex-col items-center justify-center gap-0.5 no-select transition-colors active:opacity-60',
                      active ? 'text-ink' : 'text-ink-faint'
                    )}
                  >
                    <Icon className="size-[22px]" filled={active} />
                    <span className="text-[10px] font-medium">{item.label}</span>

                    {item.href === '/invites' && pendingCount > 0 && (
                      <span className="absolute right-[calc(50%-20px)] top-1.5 grid min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* 조직 전환 — 드롭다운은 터치에서 blur 타이밍 때문에 잘 닫혀버려서 시트로 바꿨다 */}
      <BottomSheet open={orgSheetOpen} onClose={() => setOrgSheetOpen(false)} title="조직 선택">
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
    </AppContextProvider>
  );
}

/* ── 아이콘 : 외부 아이콘 패키지를 하나 더 붙일 만큼 종류가 많지 않다 ── */

function BoardIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="4" width="6.5" height="16" rx="2" fill={filled ? 'currentColor' : 'none'} />
      <rect x="14.5" y="4" width="6.5" height="11" rx="2" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

function TeamIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="9" cy="8" r="3.4" fill={filled ? 'currentColor' : 'none'} />
      <path d="M3 19.5c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" fill={filled ? 'currentColor' : 'none'} />
      <path d="M16.5 11.2a3 3 0 1 0-1.6-5.5M18 19.5c0-2.3-.7-3.9-2-5" strokeLinecap="round" />
    </svg>
  );
}

function InviteIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" fill={filled ? 'currentColor' : 'none'} />
      <path d="m4 7.5 8 5.5 8-5.5" stroke={filled ? 'var(--canvas)' : 'currentColor'} strokeLinecap="round" />
    </svg>
  );
}

function MeIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="8" r="3.6" fill={filled ? 'currentColor' : 'none'} />
      <path d="M4.5 20c0-3.6 3.3-6 7.5-6s7.5 2.4 7.5 6" fill={filled ? 'currentColor' : 'none'} />
    </svg>
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
