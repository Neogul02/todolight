'use client';

import { createContext, useContext } from 'react';
import type { MemberRole, Organization, Profile } from '@/types/db';

/**
 * board     = 멤버별 가로 캐러셀 (기본)
 * dashboard = 세로로 전부 쌓아 한 번에 훑기
 * calendar  = 마감일·일정 기준으로 언제 몰려 있나 보기
 */
export type BoardMode = 'board' | 'dashboard' | 'calendar';

export type OrgWithRole = Organization & { role: MemberRole; member_count: number };

interface AppContextValue {
  userId: string;
  email: string | null;
  profile: Profile | null;
  orgs: OrgWithRole[];
  activeOrgId: string | null;
  activeOrg: OrgWithRole | null;
  selectOrg: (id: string) => void;
  /** 프로필 메뉴 시트 열기 — 조직 전환과 받은 초대가 그 안에 있다 */
  openMenu: () => void;
  /** 받은 초대 수 */
  pendingInvites: number;
  /** 현재 조직에서 내가 방장/관리자인지 */
  isManager: boolean;
  /** 보드가 어떤 뷰인지. 전환 버튼이 헤더에 있어서 셸이 들고 있는다 */
  boardMode: BoardMode;
  setBoardMode: (mode: BoardMode) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp은 AppShell 안에서만 쓸 수 있습니다.');
  return ctx;
}
