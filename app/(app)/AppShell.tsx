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
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AppContextProvider, type OrgWithRole } from './OrgContext';

const NAV = [
  { href: '/board', label: '보드' },
  { href: '/team', label: '팀' },
  { href: '/me', label: '내 설정' },
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
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? null;

  // 프로필에 저장된 테마를 실제 화면에 반영 (localStorage 캐시도 갱신)
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

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

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
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4">
            <Link href="/board" className="text-[15px] font-semibold tracking-tight text-ink">
              todolight
            </Link>

            {/* 조직 전환 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOrgMenuOpen(v => !v)}
                onBlur={() => setTimeout(() => setOrgMenuOpen(false), 120)}
                className="flex h-8 max-w-[190px] items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-alt"
              >
                <span className="truncate">{activeOrg?.name ?? '조직 없음'}</span>
                <span className="text-ink-faint">▾</span>
              </button>

              {orgMenuOpen && (
                <div className="absolute left-0 top-9 z-40 w-60 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-level-2">
                  {orgs.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={() => {
                        selectOrg(o.id);
                        setOrgMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-alt',
                        o.id === activeOrgId ? 'text-ink' : 'text-ink-muted'
                      )}
                    >
                      <span className="truncate">{o.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {o.member_count}명
                      </span>
                    </button>
                  ))}
                  <Link
                    href="/orgs/new"
                    className="block border-t border-hairline px-3 py-2 text-[13px] text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
                  >
                    + 새 조직 만들기
                  </Link>
                </div>
              )}
            </div>

            <nav className="ml-2 hidden items-center gap-0.5 sm:flex">
              {NAV.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    pathname.startsWith(item.href)
                      ? 'bg-canvas-soft text-ink'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/invites"
                className="relative rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                초대
                {pendingCount > 0 && (
                  <Badge tone="accent" className="ml-1.5">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
              <Link href="/me" aria-label="내 설정">
                <Avatar
                  name={profile?.display_name ?? email ?? '나'}
                  emoji={profile?.avatar_emoji}
                  size="sm"
                />
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="text-[13px] text-ink-faint transition-colors hover:text-ink"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* 모바일 네비 */}
          <nav className="flex items-center gap-0.5 border-t border-hairline px-3 py-1.5 sm:hidden">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  pathname.startsWith(item.href)
                    ? 'bg-canvas-soft text-ink'
                    : 'text-ink-muted'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </AppContextProvider>
  );
}
