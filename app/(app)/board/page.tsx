import ViewPager from '../ViewPager';

/**
 * 보드·달력·가계부가 전부 이 한 라우트에 산다 — 어느 패널을 보여 줄지는 `?view=`가 정하고,
 * 그 값은 AppShell이 읽어 컨텍스트로 내려 준다(app/(app)/ViewPager.tsx 참고).
 */
export default function BoardPage() {
  return <ViewPager />;
}
