'use client';

import { createContext, useContext } from 'react';
import type { MemberRole, Organization, Profile } from '@/types/db';

/**
 * 보드 패널 **안쪽**의 레이아웃.
 *
 * board     = 멤버별 가로 캐러셀 (모바일 기본)
 * dashboard = 세로로 전부 쌓아 한 번에 훑기 (PC 전용)
 *
 * 화면 폭으로 갈리는 같은 패널의 두 모습이라 패널을 나누지 않는다 —
 * 한 화면에서 둘 중 하나만 고를 수 있다(버튼이 `sm:hidden` / `hidden sm:grid`).
 */
export type BoardMode = 'board' | 'dashboard';

/**
 * 좌우로 밀어 오가는 세 패널.
 *
 * 예전엔 `/board` · `/calendar` · `/ledger` 세 라우트였다. 라우트가 갈라져 있으면 전환마다
 * RSC 왕복이 붙고(레이아웃이 인증·조직·프로필을 await한다) 클라이언트 상태가 통째로 날아가서,
 * 가계부에 적다 만 금액도 캐러셀 위치도 매번 처음으로 돌아갔다.
 * 지금은 `/board` 한 라우트가 셋을 다 들고 `?view=`로만 구분한다(app/(app)/ViewPager.tsx).
 */
export type AppView = 'board' | 'calendar' | 'ledger';

export const APP_VIEWS: AppView[] = ['board', 'calendar', 'ledger'];

/** 모르는 값(옛 링크·오타)은 보드로 떨어뜨린다 */
export function parseAppView(raw: string | null | undefined): AppView {
  return APP_VIEWS.includes(raw as AppView) ? (raw as AppView) : 'board';
}

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
  /** 보드 패널 안쪽 레이아웃. 전환 버튼이 헤더·탭바에 있어서 셸이 들고 있는다 */
  boardMode: BoardMode;
  /** 지금 보이는 패널 */
  view: AppView;
  /** 패널을 바꾼다. `/board` 밖이면 그리로 이동하고, 안이면 주소의 `?view=`만 갈아끼운다 */
  goToView: (view: AppView, boardMode?: BoardMode) => void;
  /** 지금 상태를 그대로 담은 보드 주소 — 뒤로가기·로고 링크가 쓴다 */
  boardHref: string;
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
