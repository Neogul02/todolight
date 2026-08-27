'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { boardKeys, useBoardRealtime, useOrgMembers, useOrgPresence } from '@/hooks/useOrgBoard';
import { Button, Card } from '@/components/ui';
import type { Todo } from '@/types/db';
import { APP_VIEWS, useApp, type AppView } from './OrgContext';
import { BoardSkeleton } from './board/BoardSkeleton';
import BoardClient from './board/BoardClient';
import HandoffModal from './board/HandoffModal';
import CalendarClient from './calendar/CalendarClient';
import LedgerClient from './ledger/LedgerClient';

/** 트랙을 미는 시간. 라우트 전환(0.12s 페이드 두 번 = 265ms)보다 짧게 끝난다 */
const SLIDE_MS = 240;

/**
 * 보드 · 달력 · 가계부를 좌우로 밀어 오가는 한 페이지.
 *
 * 셋은 예전에 각각 라우트였다. 라우트가 갈라져 있으면 전환마다 (1) 레이아웃이 인증·조직·프로필을
 * await하는 탓에 RSC 왕복이 붙고 (2) 클라이언트 상태가 통째로 날아간다 — 가계부에 적다 만 금액,
 * 캐러셀 위치, 목록 스크롤이 매번 처음으로 돌아갔다. 애니메이션을 손봐도 이 둘은 남는다.
 *
 * 여기서는 세 패널이 한 트랙 위에 나란히 서 있고, 바뀌는 건 트랙의 translateX뿐이다.
 * 네트워크도 재마운트도 없다.
 *
 * **제스처는 붙이지 않는다.** 보드 패널 안이 이미 멤버별 가로 캐러셀이고 달력은 좌우로 밀어
 * 달을 넘긴다 — 바깥에 또 가로 제스처를 두면 어느 쪽이 먹을지 손이 예측할 수 없다.
 * 전환은 헤더 세그먼트(PC)와 하단 탭바(모바일)가 한다.
 */
export default function ViewPager() {
  const { activeOrgId, userId, orgs, orgsStatus, retryOrgs, openMenu, pendingInvites, view } =
    useApp();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const t = useTranslations('board');

  /*
    조직 단위로 하나만 있어야 하는 구독은 여기서 연다.
    패널마다 부르면 `board-{orgId}` 채널이 두 번 열린다 — 예전엔 보드와 달력이 각자 불렀지만
    라우트가 달라 동시에 떠 있을 일이 없었고, 이제는 둘 다 살아 있다.
  */
  useBoardRealtime(activeOrgId);
  useOrgPresence(activeOrgId, userId);
  // 시트에 "누구 대신"을 적어야 해서 여기서도 멤버가 필요하다 — 쿼리 키가 같아 요청은 한 번이다
  const members = useOrgMembers(activeOrgId);

  /*
    대신 처리 시트는 보드·달력 양쪽에서 연다.
    트랙 **바깥**에 그린다 — 시트 껍데기가 `fixed`라, transform이 걸린 트랙 안에 있으면
    뷰포트가 아니라 트랙 기준으로 배치된다(그래서 BottomSheet도 body로 포털한다).
  */
  const [handoff, setHandoff] = useState<Todo | null>(null);

  /*
    패널은 **처음 열릴 때 마운트하고 그 뒤로는 유지한다.**
    처음부터 셋을 다 켜면 한 번도 안 본 가계부의 쿼리와 실시간 채널까지 돌고,
    매번 언마운트하면 애초에 고치려던 상태 손실이 그대로 남는다.
    렌더 중 setState는 React가 허용하는 "렌더 도중 상태 조정" 패턴이다 — 이펙트로 하면
    한 프레임 늦게 마운트돼서 미는 도중 빈 칸이 보인다.
  */
  const [mounted, setMounted] = useState<AppView[]>([view]);
  if (!mounted.includes(view)) setMounted([...mounted, view]);

  const index = APP_VIEWS.indexOf(view);

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  /*
    조직 목록을 아직 못 불러왔다 — AppShellSkeleton과 같은 스켈레톤을 재사용한다.
    이 상태를 빼먹으면 첫 렌더나 포커스 복귀 재조회 도중 `orgs`가 잠깐 비어 있는 걸
    "조직이 없다"로 오인해서 진짜 조직이 있는 사람한테도 그 화면이 번쩍인다.
  */
  if (orgsStatus === 'pending') {
    return (
      <div className="min-h-0 flex-1">
        <BoardSkeleton />
      </div>
    );
  }

  /*
    포커스 복귀 재조회를 포함해 조회 자체가 실패한 경우 — 오래 백그라운드에 뒀다 돌아왔을 때
    콜드 스타트·일시적 네트워크 장애로 흔히 난다. "조직이 없다"로 떨어뜨리지 않고 다시 시도
    버튼을 준다 — 예전엔 이 구분이 없어서 앱을 아예 껐다 켜야만 벗어날 수 있었다.
  */
  if (orgsStatus === 'error') {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-tabbar text-center">
        <Card className="w-full p-6">
          <h1 className="text-heading-1 text-ink">{t('orgLoadErrorTitle')}</h1>
          <p className="mt-2 text-body-sm text-ink-muted">{t('orgLoadErrorDescription')}</p>
          <Button className="mt-5 w-full" onClick={retryOrgs}>
            {t('retry')}
          </Button>
        </Card>
      </main>
    );
  }

  /*
    조직이 하나도 없으면 패널이 다 빈 화면이다 — 트랙을 세우지 않고 할 일을 알려 준다.
    예전엔 이 안내가 보드·달력·가계부에 거의 같은 코드로 세 벌 있었다.
  */
  if (orgs.length === 0) {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-tabbar text-center">
        <h1 className="text-heading-1 text-ink">{t('noOrgTitle')}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">{t('noOrgDescription')}</p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/orgs/new"
            className="flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('createOrg')}
          </Link>
          <button
            type="button"
            onClick={openMenu}
            className="flex h-13 items-center justify-center gap-1.5 rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('checkInvites')}
            {pendingInvites > 0 && <span className="size-2 rounded-full bg-danger" />}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-viewport relative overflow-hidden">
      {/*
        트랙은 세 패널을 가로로 이어 붙인 것이고, 미는 건 이 요소 하나다.
        transform 애니메이션은 CSS로 둔다 — globals.css가 prefers-reduced-motion에서
        트랜지션을 전역으로 끄므로 모션 최소화가 공짜다(framer-motion은 CSS 미디어 쿼리를
        따르지 않아 따로 분기해야 한다).
      */}
      <div
        className="absolute inset-0 flex will-change-transform"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: reduceMotion ? undefined : `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
        }}
      >
        {APP_VIEWS.map(pane => {
          const isActive = pane === view;
          return (
            <section
              key={pane}
              /*
                inert — 화면 밖 패널로 Tab이 새면 보이지도 않는 버튼에 포커스가 앉는다.
                포인터도 같이 막혀서 미는 도중 옆 패널이 눌리는 일도 없다.
              */
              inert={!isActive}
              aria-hidden={!isActive}
              /*
                overflow는 활성/비활성에 상관없이 auto다. 비활성일 때 hidden으로 바꾸면
                스크롤이 불가능해지면서 scrollTop이 0으로 잘려서, 돌아왔을 때 목록이 맨 위로
                올라가 있다 — 이 화면을 만든 이유(상태·위치 유지)가 거기서 무너진다.
                포인터는 inert가 이미 막는다.
              */
              className="h-full w-full shrink-0 overflow-y-auto overscroll-contain"
            >
              {mounted.includes(pane) && (
                <>
                  {pane === 'board' && <BoardClient onHandoff={setHandoff} />}
                  {pane === 'calendar' && <CalendarClient onHandoff={setHandoff} />}
                  {pane === 'ledger' && <LedgerClient />}
                </>
              )}
            </section>
          );
        })}
      </div>

      {handoff && (
        <HandoffModal
          todo={handoff}
          ownerName={
            members.data?.find(m => m.user_id === handoff.owner_id)?.display_name ?? t('teammate')
          }
          onClose={() => setHandoff(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
